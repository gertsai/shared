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
