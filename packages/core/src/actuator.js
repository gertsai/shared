/**
 * @gerts/core - Actuator Interfaces
 *
 * The Actuator pattern decouples logical steps (JSON schema) from physical execution (code).
 * This is the "Node Bridge" - connecting flow definitions to actual business logic.
 *
 * @see research/architecture/13-execution-engine-spec.md Section 6.2, 7
 */
/**
 * Type guard to check if an actuator is an AI actuator
 */
export function isAIActuator(actuator) {
    return 'aiConnectionType' in actuator || 'supplyComponent' in actuator;
}
/**
 * Type guard to check if an actuator can supply components
 */
export function canSupplyComponent(actuator) {
    return isAIActuator(actuator) && typeof actuator.supplyComponent === 'function';
}
