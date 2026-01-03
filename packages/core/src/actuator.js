"use strict";
/**
 * @gerts/core - Actuator Interfaces
 *
 * The Actuator pattern decouples logical steps (JSON schema) from physical execution (code).
 * This is the "Node Bridge" - connecting flow definitions to actual business logic.
 *
 * @see research/architecture/13-execution-engine-spec.md Section 6.2, 7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAIActuator = isAIActuator;
exports.canSupplyComponent = canSupplyComponent;
/**
 * Type guard to check if an actuator is an AI actuator
 */
function isAIActuator(actuator) {
    return 'aiConnectionType' in actuator || 'supplyComponent' in actuator;
}
/**
 * Type guard to check if an actuator can supply components
 */
function canSupplyComponent(actuator) {
    return isAIActuator(actuator) && typeof actuator.supplyComponent === 'function';
}
//# sourceMappingURL=actuator.js.map