/**
 * index.mjs — The programmatic API of `@aggrega-ai/l10n`.
 *
 * READS nothing and WRITES nothing itself: it re-exports the package's modules,
 * each of which states what it reads and writes. The command line (`l10n`,
 * `bin/l10n.mjs`) is built on exactly these exports, so anything the command line
 * does a caller can do in-process — which is how a consuming project's own tests
 * run this package against its own configuration.
 */

export {
  CONFIG_FILE_NAME,
  DEFAULT_API_KEY_ENV,
  DEFAULT_SYNC_TOKEN_ENV,
  DEFAULT_MODEL,
  DEFAULT_WORKFLOW_FILE,
  TRANSLATION_DEFAULTS,
  SYNC_DEFAULTS,
  MODES,
  DEFAULT_MODE,
  LOCAL_DEFAULTS,
  ENV_NAME_PATTERN,
  BACKEND_KINDS,
  CLAUDE_CODE_DEFAULTS,
  DEFAULT_CLAUDE_CODE_TOKEN_ENV,
  JSON_CONTENT_DEFAULTS,
  DOCUMENT_WALKS,
  OUTPUT_PATHS,
  OUTPUT_KEY_ORDERS,
  OUTPUT_PAIRS,
  OUTPUT_FILE_NAMES,
  MATERIALIZE_POLICIES,
  IDENTIFIER_PLACES,
  translationSettings,
  syncSettings,
  modeOf,
  localSettings,
  jsonContentSettings,
  isLocaleCode,
  ConfigError,
  ConfigSchema,
  LocaleSetSchema,
  parseConfig,
  findConfigPath,
  loadConfig,
  createProject,
  expandLang,
  clientExposedNameProblem,
  assertServerOnlyEnvName,
} from './config.mjs';
export { createEngine } from './engine.mjs';
export { createStore, stableStringify } from './store.mjs';
export { normalize, srcHash, keyOf, KEY_LENGTH } from './normalize.mjs';
export { computeWorklist, orphanKeys, humanLine, hasWork } from './gate.mjs';
export { LAYER, STATUS, RESULT, FORMAT } from './types.mjs';
export { runPipeline, decidePipeline, ACTION } from './pipeline.mjs';
export { runCli, COMMANDS, USAGE } from './cli.mjs';
export {
  SUPPORTED_BACKENDS,
  BATCH_BACKENDS,
  BackendSelectionError,
  selectBackendKind,
  createConfiguredBackend,
  configFor,
  credentialOf,
} from './backends/index.mjs';
export { createBackend as createAnthropicBackend } from './backends/anthropic.mjs';
export {
  createClaudeCodeBackend,
  claudeCodeSettings,
  claudeCodeCredential,
  readClaudeCodeResult,
  runProcess as runClaudeCodeProcess,
  CLAUDE_CODE_LOGIN_ENV,
  MissingClaudeCodeTokenError,
} from './backends/claude-code.mjs';
export {
  generalRules,
  glossaryRules,
  doNotTranslateOf,
  DO_NOT_TRANSLATE_CASE_KEY,
  DO_NOT_TRANSLATE_CASES,
  DO_NOT_TRANSLATE_TERM_CASES,
  readTranslationMessage,
  isBalancedHtml,
  isTransient,
} from './translator-prompt.mjs';
export {
  OUTPUT_SCHEMA,
  SYSTEM_CACHE_CONTROL,
  HEADING_CONTEXT,
  GENERAL_PROMPT_FILE,
  loadLanguagePrompts,
  loadGeneralPrompt,
  loadGlossary,
  buildSystem,
  pagesFromCatalog,
  planRequests,
  buildUserMessage,
  buildMessageParams,
  modelIdFor,
} from './requests.mjs';
export { validateTranslations, segmentDefect } from './validate.mjs';
export {
  estimateTokens,
  estimateRequest,
  cachedEstimates,
  outputCeiling,
  reservesReasoning,
  REQUEST_OVERHEAD_TOKENS,
  REASONING_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
} from './tokens.mjs';
export {
  CUSTOM_ID_PATTERN,
  customIdFor,
  emptyPending,
  fallsBackAfterRefusal,
  queueDefect,
  clearQueued,
} from './pending.mjs';
export { createAnthropicClient, readApiKey, MissingApiKeyError, ANTHROPIC_API_HOST } from './client.mjs';
export { submit, collect, status, cancelBatch, planBatch, selectWithinBudget, MAX_BATCH_REQUESTS } from './batch.mjs';
export { runLocal, gitAddCommand, LOCAL_COMMAND_TIMEOUT_MS } from './local.mjs';
export { runPrepush, judgeCommit, parsePushLines, localCommandOf } from './prepush.mjs';
export { BATCH_RATES, BATCH_RATES_READ, batchCostUpperBound, formatUsd } from './cost.mjs';
export { runCi, runOverlay, workflowRequest, WorkflowRequestError, CI_COMMIT_MESSAGE, DEFAULT_API_URL } from './ci.mjs';
export { createGit, gitEnvironment, redactCredentials, GitError } from './git.mjs';
export {
  runSync,
  runWatch,
  fetchUrlFor,
  fetchSource,
  readEnvFileValue,
  readToken,
  SyncError,
  SYNC_COMMIT_MESSAGE,
  SYNC_ATTEMPTS,
  DERIVED_COMMAND_TIMEOUT_MS,
} from './sync.mjs';
export {
  WorkflowReadError,
  readWorkflow,
  PINNED,
  CI_COMMAND,
  ciStepOf,
  triggerProblems,
  collectorTriggerProblems,
  pullRequestProblems,
  permissionProblems,
  concurrencyProblems,
  checkoutProblems,
  secretProblems,
  workflowProblems,
  collectorProblems,
  sharedGroupProblems,
  CHECK_JOB,
  CHECK_PERMISSIONS,
  INSTALL_STEP,
  PREPUSH_COMMAND,
  checkTriggerProblems,
  checkPullRequestProblems,
  checkPermissionProblems,
  checkStepProblems,
  checkSecretProblems,
  checkWorkflowProblems,
} from './workflow.mjs';
export {
  DOCTOR_CHECKS,
  LOCAL_DOCTOR_CHECKS,
  HOOKS_DIR,
  PRE_PUSH_HOOK,
  CHECK_WORKFLOW_FILE,
  repositoryRoot,
  triggerPaths,
  checkTriggerPaths,
  runDoctor,
} from './doctor.mjs';
export { REFERENCE_SECTION, renderConfigReference, spliceReference, readReference } from './config-reference.mjs';
export { createAdapter, SUPPORTED_ADAPTERS } from './adapters/index.mjs';
export { createJsonContentAdapter } from './adapters/json-content/index.mjs';
export {
  createFieldRules,
  detectFormat,
  parsePath,
  stringifyPath,
  getAtPath,
  setAtPath,
} from './adapters/json-content/fields.mjs';
export { extractContent, readContentPages } from './adapters/json-content/extract-content.mjs';
export { extractUi, readUiEntries, dictionaryStrings } from './adapters/json-content/extract-ui.mjs';
export {
  generateContent,
  targetPath,
  readLangMap,
  readSourcePages,
  createOutputPlan,
  fileNameOfPath,
  ROOT_FILE_NAME,
} from './adapters/json-content/generate.mjs';
export { generateUiDictionary } from './adapters/json-content/generate-ui.mjs';
export { alignSeed, seedLocale } from './adapters/json-content/seed.mjs';
export {
  detectDrift,
  formatDriftMessage,
  scalarLeaves,
  scalarTexts,
  readCurrentTargets,
  readCurrentUiDictionaries,
} from './adapters/json-content/antidrift.mjs';
export { checkDrift, knownTextsOf, NO_DIVERGENCE_MESSAGE } from './adapters/json-content/verify-drift.mjs';
export { materialize, safeRefusals } from './adapters/json-content/materialize.mjs';
export { createMarkdownAdapter } from './adapters/markdown/index.mjs';
export { parseMarkdown } from './adapters/markdown/parse.mjs';
export { segmentMarkdown, standaloneProtectedTexts } from './adapters/markdown/segment.mjs';
export { headingSlugText, createHeadingSlugger } from './adapters/markdown/slug.mjs';
export {
  formatHeadingId,
  parseHeadingId,
  applyHeadingIds,
  remarkHeadingIds,
} from './adapters/markdown/heading-id.mjs';
export { splice } from './adapters/markdown/splice.mjs';
export { markdownTreeShape } from './adapters/markdown/shape.mjs';
export { MarkdownSourceError } from './adapters/markdown/source-error.mjs';
export { createPseudoLocalizer, pseudoLocalize } from './pseudo-localizer.mjs';
