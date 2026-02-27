import { parseJavaContent } from '../src/indexer/parser.js';

describe('Java Parser', () => {
  test('parses simple class', () => {
    const javaCode = `
package net.minecraft.test;

public class SimpleClass {
    public static final int CONSTANT = 42;
    
    private String name;
    
    public void doSomething() {
        System.out.println("Hello");
    }
    
    public int add(int a, int b) {
        return a + b;
    }
}
`;
    
    const result = parseJavaContent(javaCode, '/test/SimpleClass.java');
    
    expect(result).not.toBeNull();
    expect(result?.packageName).toBe('net.minecraft.test');
    expect(result?.className).toBe('SimpleClass');
    expect(result?.fullName).toBe('net.minecraft.test.SimpleClass');
  });
  
  test('parses class with extends and implements', () => {
    const javaCode = `
package net.minecraft.entity;

public class PlayerEntity extends LivingEntity implements Attackable {
}
`;
    
    const result = parseJavaContent(javaCode, '/test/PlayerEntity.java');
    
    expect(result).not.toBeNull();
    expect(result?.info.super).toBe('LivingEntity');
    expect(result?.info.interfaces).toContain('Attackable');
  });
  
  test('extracts fields', () => {
    const javaCode = `
package test;

public class FieldsTest {
    public static final int MAX_VALUE = 100;
    private String privateField;
    protected List<String> items;
}
`;
    
    const result = parseJavaContent(javaCode, '/test/FieldsTest.java');
    
    expect(result).not.toBeNull();
    expect(result?.info.fields.length).toBeGreaterThan(0);
    
    const maxField = result?.info.fields.find(f => f.name === 'MAX_VALUE');
    expect(maxField).toBeDefined();
    expect(maxField?.modifiers).toContain('public');
    expect(maxField?.modifiers).toContain('static');
    expect(maxField?.modifiers).toContain('final');
  });
  
  test('extracts methods with parameters', () => {
    const javaCode = `
package test;

public class MethodTest {
    public void simpleMethod() {
    }
    
    public int methodWithParams(String name, int count) {
        return count;
    }
    
    private static List<String> staticMethod() {
        return null;
    }
}
`;
    
    const result = parseJavaContent(javaCode, '/test/MethodTest.java');
    
    expect(result).not.toBeNull();
    
    const simpleMethod = result?.info.methods.find(m => m.name === 'simpleMethod');
    expect(simpleMethod).toBeDefined();
    expect(simpleMethod?.returnType).toBe('void');
    expect(simpleMethod?.params).toHaveLength(0);
    
    const paramsMethod = result?.info.methods.find(m => m.name === 'methodWithParams');
    expect(paramsMethod).toBeDefined();
    expect(paramsMethod?.params).toHaveLength(2);
    expect(paramsMethod?.params[0].name).toBe('name');
    expect(paramsMethod?.params[1].name).toBe('count');
  });
  
  test('handles nested classes', () => {
    const javaCode = `
package test;

public class OuterClass {
    public static class InnerClass {
        public void innerMethod() {}
    }
}
`;
    
    const result = parseJavaContent(javaCode, '/test/OuterClass.java');
    
    expect(result).not.toBeNull();
    expect(result?.className).toBe('OuterClass');
  });
  
  test('handles generic types', () => {
    const javaCode = `
package test;

public class GenericTest {
    private List<String> items;
    
    public void process(String value, List<String> list) {
    }
}
`;
    
    const result = parseJavaContent(javaCode, '/test/GenericTest.java');
    
    expect(result).not.toBeNull();
    expect(result?.className).toBe('GenericTest');
  });
});
