// ============================================================================
// Check Trigger & Errors
// ============================================================================
/** Trigger reason for check errors */
export var CheckTrigger;
(function (CheckTrigger) {
    CheckTrigger["INPUT_NOT_ALLOWED"] = "input_not_allowed";
    CheckTrigger["OUTPUT_NOT_ALLOWED"] = "output_not_allowed";
    CheckTrigger["OFF_TOPIC"] = "off_topic";
    CheckTrigger["PII_DETECTED"] = "pii_detected";
    CheckTrigger["PROMPT_INJECTION"] = "prompt_injection";
    CheckTrigger["UNSAFE_CONTENT"] = "unsafe_content";
    CheckTrigger["QUOTA_EXCEEDED"] = "quota_exceeded";
    CheckTrigger["TOOL_BLOCKED"] = "tool_blocked";
    CheckTrigger["VALIDATION_FAILED"] = "validation_failed";
})(CheckTrigger || (CheckTrigger = {}));
/** Error thrown by input validation hooks */
export class InputCheckError extends Error {
    checkTrigger;
    constructor(message, checkTrigger) {
        super(message);
        this.checkTrigger = checkTrigger;
        this.name = 'InputCheckError';
        Object.setPrototypeOf(this, InputCheckError.prototype);
    }
}
/** Error thrown by output validation hooks */
export class OutputCheckError extends Error {
    checkTrigger;
    constructor(message, checkTrigger) {
        super(message);
        this.checkTrigger = checkTrigger;
        this.name = 'OutputCheckError';
        Object.setPrototypeOf(this, OutputCheckError.prototype);
    }
}
// ============================================================================
// Event Types
// ============================================================================
/** Run event types */
export var RunEvent;
(function (RunEvent) {
    // Run lifecycle
    RunEvent["RUN_STARTED"] = "run_started";
    RunEvent["RUN_CONTENT"] = "run_content";
    RunEvent["RUN_COMPLETED"] = "run_completed";
    RunEvent["RUN_ERROR"] = "run_error";
    RunEvent["RUN_CANCELLED"] = "run_cancelled";
    RunEvent["RUN_PAUSED"] = "run_paused";
    RunEvent["RUN_CONTINUED"] = "run_continued";
    // Hook events
    RunEvent["PRE_HOOK_STARTED"] = "pre_hook_started";
    RunEvent["PRE_HOOK_COMPLETED"] = "pre_hook_completed";
    RunEvent["PRE_HOOK_ERROR"] = "pre_hook_error";
    RunEvent["POST_HOOK_STARTED"] = "post_hook_started";
    RunEvent["POST_HOOK_COMPLETED"] = "post_hook_completed";
    RunEvent["POST_HOOK_ERROR"] = "post_hook_error";
    // Tool events
    RunEvent["TOOL_CALL_STARTED"] = "tool_call_started";
    RunEvent["TOOL_CALL_COMPLETED"] = "tool_call_completed";
    RunEvent["TOOL_CALL_ERROR"] = "tool_call_error";
    // LLM events
    RunEvent["LLM_CALL_STARTED"] = "llm_call_started";
    RunEvent["LLM_CALL_COMPLETED"] = "llm_call_completed";
    RunEvent["LLM_CALL_ERROR"] = "llm_call_error";
    // Memory events
    RunEvent["MEMORY_UPDATE_STARTED"] = "memory_update_started";
    RunEvent["MEMORY_UPDATE_COMPLETED"] = "memory_update_completed";
    // Custom event
    RunEvent["CUSTOM_EVENT"] = "custom_event";
})(RunEvent || (RunEvent = {}));
/** Keys to deep copy for background hooks */
export const BACKGROUND_HOOK_COPY_KEYS = new Set([
    'runInput',
    'runContext',
    'runOutput',
    'sessionState',
    'dependencies',
    'metadata',
]);
