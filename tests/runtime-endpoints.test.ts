import { jest } from '@jest/globals';

const sendMock = jest.fn();

jest.unstable_mockModule('../src/tools/runtime/session.js', () => ({
  bridgeSession: {
    send: sendMock,
  },
}));

const {
  mcGetItemTextureTool,
  mcGetItemTextureByIdTool,
  mcGetEntityItemTextureTool,
} = await import('../src/tools/runtime/items.js');

const {
  mcNearbyEntitiesTool,
  mcEntityDetailsTool,
  mcLookedAtEntityTool,
  mcSetEntityGlowTool,
} = await import('../src/tools/runtime/entities.js');

const { mcSearchRuntimeTool } = await import('../src/tools/runtime/search.js');
const { mcScreenshotTool } = await import('../src/tools/runtime/screenshot.js');
const { mcRunCommandTool } = await import('../src/tools/runtime/command.js');

function ok(result: unknown) {
  return { id: 'req_1', success: true, result };
}

describe('DebugBridge runtime endpoint tools', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  test('mc_get_item_texture calls getItemTexture with slot payload', async () => {
    sendMock.mockResolvedValueOnce(ok({
      base64Png: 'abc',
      width: 32,
      height: 32,
      spriteName: 'minecraft:diamond',
    }) as never);

    const response = await mcGetItemTextureTool.handler({ slot: 4 });

    expect(sendMock).toHaveBeenCalledWith('getItemTexture', { slot: 4 });
    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain('"spriteName": "minecraft:diamond"');
  });

  test('mc_get_item_texture_by_id calls getItemTextureById with item id payload', async () => {
    sendMock.mockResolvedValueOnce(ok({
      base64Png: 'abc',
      width: 32,
      height: 32,
      spriteName: 'minecraft:apple',
    }) as never);

    await mcGetItemTextureByIdTool.handler({ itemId: 'minecraft:apple' });

    expect(sendMock).toHaveBeenCalledWith('getItemTextureById', { itemId: 'minecraft:apple' });
  });

  test('mc_get_entity_item_texture calls getEntityItemTexture with entity and slot payload', async () => {
    sendMock.mockResolvedValueOnce(ok({
      base64Png: 'abc',
      width: 32,
      height: 32,
      spriteName: 'minecraft:iron_sword',
    }) as never);

    await mcGetEntityItemTextureTool.handler({ entityId: 12, slot: 'mainhand' });

    expect(sendMock).toHaveBeenCalledWith('getEntityItemTexture', {
      entityId: 12,
      slot: 'mainhand',
    });
  });

  test('mc_nearby_entities calls nearbyEntities with defaults when args are empty', async () => {
    sendMock.mockResolvedValueOnce(ok({ entities: [], count: 0 }) as never);

    await mcNearbyEntitiesTool.handler({});

    expect(sendMock).toHaveBeenCalledWith('nearbyEntities', {
      range: 64,
      limit: 100,
    });
  });

  test('mc_entity_details calls entityDetails with entity id payload', async () => {
    sendMock.mockResolvedValueOnce(ok({ entityId: 12, type: 'net.minecraft.world.entity.Entity' }) as never);

    await mcEntityDetailsTool.handler({ entityId: 12 });

    expect(sendMock).toHaveBeenCalledWith('entityDetails', { entityId: 12 });
  });

  test('mc_looked_at_entity calls lookedAtEntity with range payload', async () => {
    sendMock.mockResolvedValueOnce(ok({ entityId: 12 }) as never);

    await mcLookedAtEntityTool.handler({ range: 48 });

    expect(sendMock).toHaveBeenCalledWith('lookedAtEntity', { range: 48 });
  });

  test('mc_set_entity_glow calls setEntityGlow with entity id and glow payload', async () => {
    sendMock.mockResolvedValueOnce(ok({ entityId: 12, glow: true }) as never);

    await mcSetEntityGlowTool.handler({ entityId: 12, glow: true });

    expect(sendMock).toHaveBeenCalledWith('setEntityGlow', {
      entityId: 12,
      glow: true,
    });
  });

  test('mc_search_runtime calls search with pattern and scope payload', async () => {
    sendMock.mockResolvedValueOnce(ok([{ type: 'class', name: 'net.minecraft.client.Minecraft' }]) as never);

    await mcSearchRuntimeTool.handler({ pattern: 'Minecraft', scope: 'class' });

    expect(sendMock).toHaveBeenCalledWith('search', {
      pattern: 'Minecraft',
      scope: 'class',
    });
  });

  test('mc_screenshot forwards timeoutMs when provided', async () => {
    sendMock.mockResolvedValueOnce(ok({
      path: 'C:/tmp/debugbridge-screenshot.jpg',
      width: 800,
      height: 600,
      sizeBytes: 1024,
      mimeType: 'image/jpeg',
    }) as never);

    await mcScreenshotTool.handler({ downscale: 1, quality: 0.9, timeoutMs: 7500 });

    expect(sendMock).toHaveBeenCalledWith('screenshot', {
      downscale: 1,
      quality: 0.9,
      timeoutMs: 7500,
    });
  });

  test('runtime tools return DebugBridge errors as MCP errors', async () => {
    sendMock.mockResolvedValueOnce({
      id: 'req_1',
      success: false,
      error: 'No texture provider configured',
    } as never);

    const response = await mcGetItemTextureTool.handler({ slot: 0 });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('No texture provider configured');
  });

  test('mc_run_command falls back to Lua execute for newer snapshots with connection field', async () => {
    sendMock
      .mockResolvedValueOnce({
        id: 'req_1',
        success: false,
        error: 'LuaError: No method connection',
      } as never)
      .mockResolvedValueOnce(ok('Command sent: say hi') as never);

    const response = await mcRunCommandTool.handler({ command: '/say hi' });

    expect(sendMock).toHaveBeenNthCalledWith(1, 'runCommand', { command: 'say hi' });
    expect(sendMock).toHaveBeenNthCalledWith(2, 'execute', {
      code: expect.stringContaining('player.connection'),
    });
    expect(sendMock).toHaveBeenNthCalledWith(2, 'execute', {
      code: expect.stringContaining('connection:sendCommand("say hi")'),
    });
    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain('Command sent');
  });
});
