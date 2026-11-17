import path from 'node:path';
import { ensure } from './errors.js';
import { config, configPath, read, write } from './store.js';
import { localRef } from './git.js';
export function validationSettings(input) {
    ensure(input && typeof input === 'object', 'INVALID_CONFIG', '检查配置必须是 JSON 对象');
    const data = input;
    ensure(Array.isArray(data.checks ?? []), 'INVALID_CONFIG', 'checks 必须是数组');
    const names = new Set();
    const checks = (data.checks ?? []).map((raw) => {
        ensure(raw && typeof raw === 'object', 'INVALID_CONFIG', '检查项必须是对象');
        const c = raw;
        ensure(typeof c.name === 'string' && c.name.trim() && !names.has(c.name), 'INVALID_CONFIG', '检查名称必须非空且唯一');
        names.add(c.name);
        ensure(Array.isArray(c.command) && c.command.length > 0 && c.command.every(s => typeof s === 'string' && !s.includes('\0')) && c.command[0], 'INVALID_CONFIG', 'command 必须是非空的参数数组，不接受 shell 字符串');
        const cwd = c.cwd ?? '.';
        const timeoutMs = c.timeoutMs ?? 120_000;
        ensure(typeof cwd === 'string' && !path.isAbsolute(cwd) && !cwd.split(/[\\/]/).includes('..'), 'INVALID_CONFIG', '检查目录必须是验证目录内部的相对路径');
        ensure(typeof timeoutMs === 'number' && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 3_600_000, 'INVALID_CONFIG', 'timeoutMs 必须在 1 到 3600000 之间');
        return { name: c.name, command: c.command, cwd, timeoutMs };
    });
    const manualChecks = data.manualChecks ?? [];
    ensure(Array.isArray(manualChecks) && manualChecks.every(s => typeof s === 'string' && s.trim()) && new Set(manualChecks).size === manualChecks.length, 'INVALID_CONFIG', 'manualChecks 必须是唯一的非空字符串数组');
    return { checks, manualChecks: manualChecks };
}
export function setConfig(repo, key, value) {
    const c = config(repo);
    if (key === 'default-target') {
        localRef(repo.root, value);
        c.defaultTarget = value;
    }
    else if (key === 'checks')
        Object.assign(c, validationSettings(read(path.resolve(value))));
    else
        ensure(false, 'INVALID_CONFIG_KEY', '支持的配置项：default-target、checks');
    write(configPath(repo), c);
    return c;
}
