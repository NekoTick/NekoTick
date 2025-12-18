/**
 * Storage Module - 统一存储架构
 * 
 * 核心理念：世界上只有一种"事项"（UnifiedTask）
 * 
 * 存储位置：
 * - .nekotick/data.json (数据源)
 * - nekotick.md (人类可读的备份)
 */

// Main exports
export {
  loadUnifiedData,
  saveUnifiedData,
  saveUnifiedDataImmediate,
  type UnifiedData,
  type UnifiedTask,
  type UnifiedGroup,
  type UnifiedProgress,
  type UnifiedArchiveSection,
  type UnifiedArchiveEntry,
} from './unifiedStorage';

// Path utilities
export {
  getBasePath,
  getPaths,
  ensureDirectories,
} from './paths';
