import * as fs from 'fs';
import * as path from 'path';
import { ClassInfo, FieldInfo, MethodInfo, ClassKind } from '../utils/types.js';

export interface ParsedClass {
  packageName: string;
  className: string;
  fullName: string;
  info: ClassInfo;
  rawContent: string;
}

export function parseJavaFile(filePath: string): ParsedClass | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseJavaContent(content, filePath);
}

export function parseJavaContent(content: string, filePath: string): ParsedClass | null {
  const lines = content.split('\n');
  
  const packageName = extractPackage(content);
  const className = extractClassName(content);
  
  if (!className) return null;
  
  const fullName = packageName ? `${packageName}.${className}` : className;
  
  const kind = extractClassKind(content);
  
  const classMatch = content.match(/(?:public|protected|private)?\s*(?:abstract|final)?\s*(?:class|interface|enum)\s+(\w+)(?:\s+extends\s+([^{<\s]+))?(?:\s+implements\s+([^{{]+))?\s*\{/);
  
  if (!classMatch) return null;
  
  const superClass = classMatch[2] ? cleanTypeName(classMatch[2]) : null;
  const interfaces = classMatch[3] 
    ? classMatch[3].split(',').map(s => cleanTypeName(s.trim())).filter(s => s)
    : [];
  
  const fields = extractFields(content, lines);
  const methods = extractMethods(content, lines);
  
  const relativePath = filePath.replace(/\\/g, '/');
  
  return {
    packageName,
    className,
    fullName,
    info: {
      kind,
      super: superClass,
      interfaces,
      fields,
      methods,
      sourcePath: relativePath,
    },
    rawContent: content,
  };
}

function extractPackage(content: string): string {
  const match = content.match(/package\s+([\w.]+)\s*;/);
  return match ? match[1] : '';
}

function extractClassName(content: string): string | null {
  const match = content.match(/(?:public\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)/);
  return match ? match[1] : null;
}

function extractClassKind(content: string): ClassKind {
  if (/(?:public\s+)?(?:abstract\s+|final\s+)?interface\s+\w+/.test(content)) {
    return 'interface';
  }
  if (/(?:public\s+)?(?:abstract\s+|final\s+)?enum\s+\w+/.test(content)) {
    return 'enum';
  }
  return 'class';
}

function cleanTypeName(type: string): string {
  return type.replace(/[<>\[\]]/g, '').replace(/\s+/g, '').split('.')[0] || type;
}

function extractFields(content: string, lines: string[]): FieldInfo[] {
  const fields: FieldInfo[] = [];
  
  const fieldRegex = /(?:public|protected|private)\s+(?:static\s+)?(?:final\s+)?(\w+(?:<[^>]+>)?(?:\[\])*)\s+(\w+)\s*(?:=|;)/g;
  
  let match;
  while ((match = fieldRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const lineNum = content.substring(0, match.index).split('\n').length;
    const lineContent = lines[lineNum - 1] || '';
    
    if (lineContent.includes('(') || lineContent.includes(')')) continue;
    
    const modifiers = extractModifiers(fullMatch);
    
    fields.push({
      name: match[2],
      type: cleanTypeName(match[1]),
      modifiers,
    });
  }
  
  return fields;
}

function extractMethods(content: string, lines: string[]): MethodInfo[] {
  const methods: MethodInfo[] = [];
  
  const methodRegex = /(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:synchronized\s+)?(\w+(?:<[^>]+>)?(?:\[\])*)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w.,\s]+)?\s*(?:\{|;)/g;
  
  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    const returnType = match[1];
    const methodName = match[2];
    const paramsStr = match[3];
    
    if (returnType === 'class' || methodName === 'if' || methodName === 'while' || methodName === 'for' || methodName === 'switch' || methodName === 'catch') {
      continue;
    }
    
    if (methodName.match(/^[A-Z]/) && !returnType) {
      continue;
    }
    
    const lineStart = content.substring(0, match.index).split('\n').length;
    const lineEnd = findMethodEnd(content, match.index) || lineStart + 10;
    
    const modifiers = extractModifiers(match[0]);
    const params = parseParams(paramsStr);
    
    methods.push({
      name: methodName,
      returnType: cleanTypeName(returnType),
      params,
      modifiers,
      lineStart,
      lineEnd,
    });
  }
  
  return methods;
}

function extractModifiers(declaration: string): string[] {
  const modifiers: string[] = [];
  const modKeywords = ['public', 'protected', 'private', 'static', 'final', 'abstract', 'synchronized', 'volatile', 'transient', 'native'];
  
  for (const mod of modKeywords) {
    if (new RegExp(`\\b${mod}\\b`).test(declaration)) {
      modifiers.push(mod);
    }
  }
  
  return modifiers;
}

function parseParams(paramsStr: string): { name: string; type: string }[] {
  if (!paramsStr.trim()) return [];
  
  const params: { name: string; type: string }[] = [];
  const parts = splitParams(paramsStr);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    const paramMatch = trimmed.match(/(?:final\s+)?(\w+(?:<[^>]+>)?(?:\[\])*)\s+(\w+)$/);
    if (paramMatch) {
      params.push({
        type: cleanTypeName(paramMatch[1]),
        name: paramMatch[2],
      });
    }
  }
  
  return params;
}

function splitParams(paramsStr: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  
  for (const char of paramsStr) {
    if (char === '<' || char === '(') depth++;
    else if (char === '>' || char === ')') depth--;
    else if (char === ',' && depth === 0) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  
  if (current.trim()) result.push(current);
  
  return result;
}

function findMethodEnd(content: string, startIndex: number): number | null {
  let braceCount = 0;
  let foundOpen = false;
  
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      braceCount++;
      foundOpen = true;
    } else if (content[i] === '}') {
      braceCount--;
      if (foundOpen && braceCount === 0) {
        return content.substring(0, i).split('\n').length;
      }
    }
  }
  
  return null;
}
