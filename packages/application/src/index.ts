/**
 * Public export surface for @pulse-brazil/application. Use cases, ports
 * (contracts only — no implementations), and DTOs. Depends on
 * @pulse-brazil/domain; nothing else. See README.md for the architecture note.
 */

export * from "./errors/ApplicationError.js";

export * from "./ports/IAccountRepository.js";
export * from "./ports/ITemperatureAssessmentRepository.js";
export * from "./ports/ISignalRepository.js";
export * from "./ports/IDocumentRepository.js";
export * from "./ports/INoteRepository.js";
export * from "./ports/IThemeRepository.js";
export * from "./ports/IInsightRepository.js";
export * from "./ports/IContextBundleRepository.js";
export * from "./ports/IClaudeService.js";
export * from "./ports/IGeocoder.js";
export * from "./ports/IIdGenerator.js";

export * from "./dto/account/AccountSummaryDto.js";
export * from "./dto/account/AccountDetailDto.js";
export * from "./dto/account/AccountMapPinDto.js";
export * from "./dto/signal/SignalDto.js";
export * from "./dto/document/DocumentDto.js";
export * from "./dto/note/NoteDto.js";
export * from "./dto/insight/InsightDto.js";
export * from "./dto/temperature/TemperatureAssessmentDto.js";

export * from "./use-cases/account/GetAccountDetail.js";
export * from "./use-cases/account/ListAccounts.js";
export * from "./use-cases/account/CreateAccount.js";
export * from "./use-cases/account/UpdateAccountTemperature.js";
export * from "./use-cases/account/ResolveAccountCoordinate.js";
export * from "./use-cases/account/ListAccountsWithCoordinates.js";
export * from "./use-cases/signal/CreateSignal.js";
export * from "./use-cases/signal/ListSignalsForAccount.js";
export * from "./use-cases/document/SubmitDocument.js";
export * from "./use-cases/document/TransitionDocumentState.js";
export * from "./use-cases/note/CreateNote.js";
export * from "./use-cases/insight/GenerateInsight.js";
export * from "./use-cases/context/BuildContextBundle.js";
