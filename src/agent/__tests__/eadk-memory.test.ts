/**
 * EADK Memory Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MemoryService, InMemoryBackend, createMemoryService } from '../memory';

describe('InMemoryBackend', () => {
  let backend: InMemoryBackend;

  beforeEach(() => {
    backend = new InMemoryBackend();
  });

  it('should save and get entries', async () => {
    await backend.save({
      key: 'test',
      value: { data: 'hello' },
      scope: 'session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const entry = await backend.get('test', 'session');
    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual({ data: 'hello' });
  });

  it('should return null for missing entries', async () => {
    const entry = await backend.get('nonexistent', 'session');
    expect(entry).toBeNull();
  });

  it('should delete entries', async () => {
    await backend.save({
      key: 'test',
      value: 'hello',
      scope: 'session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await backend.delete('test', 'session');
    const entry = await backend.get('test', 'session');
    expect(entry).toBeNull();
  });

  it('should list entries by scope', async () => {
    await backend.save({
      key: 'a',
      value: 1,
      scope: 'session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await backend.save({
      key: 'b',
      value: 2,
      scope: 'session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await backend.save({
      key: 'c',
      value: 3,
      scope: 'app',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const sessionEntries = await backend.list('session');
    expect(sessionEntries).toHaveLength(2);

    const appEntries = await backend.list('app');
    expect(appEntries).toHaveLength(1);
  });

  it('should search entries', async () => {
    await backend.save({
      key: 'greeting',
      value: 'Hello world',
      scope: 'session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await backend.save({
      key: 'farewell',
      value: 'Goodbye world',
      scope: 'session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const results = await backend.search('hello', 'session');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should clear by scope', async () => {
    await backend.save({
      key: 'a',
      value: 1,
      scope: 'session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await backend.save({
      key: 'b',
      value: 2,
      scope: 'app',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await backend.clear('session');

    expect(await backend.list('session')).toHaveLength(0);
    expect(await backend.list('app')).toHaveLength(1);
  });

  it('should clear all', async () => {
    await backend.save({
      key: 'a',
      value: 1,
      scope: 'session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await backend.save({
      key: 'b',
      value: 2,
      scope: 'app',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await backend.clear();

    expect(await backend.list('session')).toHaveLength(0);
    expect(await backend.list('app')).toHaveLength(0);
  });
});

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(() => {
    service = createMemoryService({
      backend: 'memory',
      shortTerm: true,
      longTerm: true,
      entity: true,
    });
  });

  it('should save and get values', async () => {
    await service.save('key', 'value');
    const result = await service.get('key');
    expect(result).toBe('value');
  });

  it('should delete values', async () => {
    await service.save('key', 'value');
    await service.delete('key');
    const result = await service.get('key');
    expect(result).toBeUndefined();
  });

  it('should search values', async () => {
    await service.save('greeting', 'Hello world');
    const results = await service.search('hello');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should save and get entities', async () => {
    await service.saveEntity('person', 'john', {
      name: 'John Doe',
      age: 30,
    });

    const entity = await service.getEntity('person', 'john');
    expect(entity).toEqual({ name: 'John Doe', age: 30 });
  });

  it('should handle working memory', async () => {
    await service.saveWorkingMemory('temp', 'data', 10000);
    const result = await service.get('temp', 'temp');
    expect(result).toBe('data');
  });

  it('should list entries', async () => {
    await service.save('a', 1);
    await service.save('b', 2);
    const entries = await service.list();
    expect(entries).toHaveLength(2);
  });

  it('should clear all', async () => {
    await service.save('a', 1);
    await service.save('b', 2, 'app');
    await service.clear();
    expect(await service.list()).toHaveLength(0);
    expect(await service.list('app')).toHaveLength(0);
  });
});

describe('createMemoryService', () => {
  it('should create in-memory service', () => {
    const service = createMemoryService({ backend: 'memory' });
    expect(service).toBeInstanceOf(MemoryService);
  });

  it('should create OPFS fallback service', () => {
    const service = createMemoryService({ backend: 'opfs' });
    expect(service).toBeInstanceOf(MemoryService);
  });
});
