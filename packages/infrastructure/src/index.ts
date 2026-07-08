/**
 * Public export surface for @pulse-brazil/infrastructure: every adapter
 * that satisfies a port from @pulse-brazil/application, plus the
 * CompositionRoot that wires them into ready-to-use use case instances.
 */

export * from "./adapters/ClaudeServiceAdapter.js";
export * from "./adapters/GeocoderAdapter.js";
export * from "./adapters/UlidIdGenerator.js";
export * from "./adapters/PostgresAccountRepository.js";
export * from "./adapters/PostgresSignalRepository.js";
export * from "./adapters/PostgresDocumentRepository.js";
export * from "./adapters/PostgresNoteRepository.js";
export * from "./adapters/PostgresThemeRepository.js";
export * from "./adapters/PostgresInsightRepository.js";
export * from "./adapters/PostgresContextBundleRepository.js";
export * from "./adapters/PostgresTemperatureAssessmentRepository.js";

export * from "./db/pool.js";

export * from "./composition/CompositionRoot.js";
