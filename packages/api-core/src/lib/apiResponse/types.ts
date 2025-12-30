import typia from 'typia';

import type { TypiaValidator } from '../common';

export enum ResponseCode {
  SUCCESS = '200/ok',
  SUCCESS_CREATED = '201/created',
  SUCCESS_ACCEPTED = '202/accepted',
  SUCCESS_NO_RESPONSE = '204/no_response',
  SUCCESS_PARTIAL_RESPONSE = '206/partial_response',
  //
  MULTIPLE_CHOICES = '300/multiple_choices',
  PERMANENTLY_MOVED = '301/permanently_moved',
  FOUND = '302/found',
  SEE_OTHER = '303/see_other',
  NOT_MODIFIED = '304/not_modified',
  TEMPORARY_REDIRECT = '307/temporary_redirect',
  PERMANENT_REDIRECT = '308/permanent_redirect',
  //
  BAD_REQUEST = '400/bad_request',
  BAD_REQUEST__INVALID_PARAMS = '400/01/invalid_params',
  BAD_REQUEST__INVALID_RESPONSE = '400/02/invalid_response', // TODO: придумать другой код
  //
  NOT_AUTHORIZED = '401/not_authorized',
  NOT_AUTHORIZED__TOKEN_INVALID = '401/01/token_invalid',
  NOT_AUTHORIZED__TOKEN_EXPIRED = '401/02/token_expired',
  NOT_AUTHORIZED__USER_NOT_FOUND = '401/03/user_not_found',
  NOT_AUTHORIZED__USER_INACTIVE = '401/04/user_inactive',
  //
  PAYMENT_REQUIRED = '402/payment_required',
  //
  FORBIDDEN = '403/forbidden',
  FORBIDDEN__INSUFFICIENT_RIGHTS = '403/01/forbidden', // When user don't have needed rights
  //
  NOT_FOUND = '404/not_found',
  NOT_FOUND__ACTION_NOT_FOUND = '404/01/action_not_found',
  //
  METHOD_NOT_ALLOWED = '405/method_not_allowed',
  NOT_ACCEPTABLE = '406/not_acceptable',
  PROXY_AUTHENTICATION_REQUIRED = '407/proxy_authentication_required',
  REQUEST_TIMEOUT = '408/request_timeout',
  CONFLICT = '409/conflict',
  GONE = '410/gone',
  LENGTH_REQUIRED = '411/length_required',
  PRECONDITION_FAILED = '412/precondition_failed',
  PAYLOAD_TOO_LARGE = '413/payload_too_large',
  URI_TOO_LONG = '414/uri_too_long',
  UNSUPPORTED_MEDIA_TYPE = '415/unsupported_media_type',
  RANGE_NOT_SATISFIABLE = '416/range_not_satisfiable',
  EXPECTATION_FAILED = '417/expectation_failed',
  IM_A_TEAPOT = '418/im_a_teapot',
  MISDIRECTED_REQUEST = '421/misdirected_request',
  UNPROCESSABLE_ENTITY = '422/unprocessable_entity',
  LOCKED = '423/locked',
  FAILED_DEPENDENCY = '424/failed_dependency',
  TOO_EARLY = '425/too_early',
  UPGRADE_REQUIRED = '426/upgrade_required',
  PRECONDITION_REQUIRED = '428/precondition_required',
  //
  TOO_MANY_REQUESTS = '429/too_many_requests',
  //
  REQUEST_HEADER_FIELDS_TOO_LARGE = '431/request_header_fields_too_large',
  UNAVAILABLE_FOR_LEGAL_REASONS = '451/unavailable_for_legal_reasons',
  //
  INTERNAL_ERROR = '500/internal_error',
  //
  NOT_IMPLEMENTED = '501/not_implemented',
  BAD_GATEWAY = '502/bad_gateway',
  SERVICE_UNAVAILABLE = '503/service_unavailable',
  GATEWAY_TIMEOUT = '504/gateway_timeout',
  HTTP_VERSION_NOT_SUPPORTED = '505/http_version_not_supported',
  VARIANT_ALSO_NEGOTIATES = '506/variant_also_negotiates',
  INSUFFICIENT_STORAGE = '507/insufficient_storage',
  LOOP_DETECTED = '508/loop_detected',
  NOT_EXTENDED = '510/not_extended',
  NETWORK_AUTHENTICATION_REQUIRED = '511/network_authentication_required',
  // OAuth errors
  ACCESS_DENIED = '400/access_denied',
  INSUFFICIENT_SCOPE = '403/insufficient_scope',
  INVALID_ARGUMENT = '500/invalid_argument',
  INVALID_CLIENT = '400/invalid_client',
  INVALID_GRANT = '400/invalid_grant',
  INVALID_REQUEST = '400/invalid_request',
  INVALID_SCOPE = '400/invalid_scope',
  INVALID_TOKEN = '400/invalid_token',
  REVOKED_TOKEN = '400/revoked_token',
  SERVER_ERROR = '503/server_error',
  UNAUTHORIZED_CLIENT = '400/unauthorized_client',
  UNAUTHORIZED_REQUEST = '401/unauthorized_request',
  UNSUPPORTED_GRANT_TYPE = '400/unsupported_grant_type',
  UNSUPPORTED_RESPONSE_TYPE = '400/unsupported_response_type',
}

type ResponseMeta<CODE extends ResponseCode, DATA> = {
  validator: TypiaValidator<DATA>;
  meta: {
    success: boolean;
    message: string;
    code: CODE;
    http_code: number;
    raw?: boolean;
  };
};

const anyValidator = typia.createValidate<any>();
const neverValidator = typia.createValidate<never>();

/**
 * Helper to generate responseMeta
 * @param code
 * @param message
 * @param validator
 */
const generateResponseMeta = <
  CODE extends ResponseCode,
  Validator extends TypiaValidator<any>,
  DATA extends Validator extends TypiaValidator<infer T> ? T : never,
>(
  code: CODE,
  message: string,
  validator?: Validator,
) =>
  ({
    [code]: {
      validator: validator ?? neverValidator,
      meta: {
        success: true,
        message,
        code,
        http_code: +code.split('/')[0],
      },
    },
  }) as unknown as Record<CODE, ResponseMeta<CODE, DATA>>;

/**
 * Helper to generate errorMeta
 * @param code
 * @param message
 * @param validator
 */
const generateErrorMeta = <
  CODE extends ResponseCode,
  Validator extends TypiaValidator<any>,
  DATA extends Validator extends TypiaValidator<infer T> ? T : never,
>(
  code: CODE,
  message: string,
  validator?: Validator,
) =>
  ({
    [code]: {
      validator: validator ?? neverValidator,
      meta: {
        success: false,
        message,
        code,
        http_code: +code.split('/')[0],
      },
    },
  }) as unknown as Record<CODE, ResponseMeta<CODE, DATA>>;

export const responseMetadata = {
  ...generateResponseMeta(ResponseCode.SUCCESS, 'Success', anyValidator),
  ...generateResponseMeta(
    ResponseCode.SUCCESS_CREATED,
    'Success; Created',
    anyValidator,
  ),
  ...generateResponseMeta(
    ResponseCode.SUCCESS_ACCEPTED,
    'Success; Accepted',
    anyValidator,
  ),
  ...generateResponseMeta(
    ResponseCode.SUCCESS_PARTIAL_RESPONSE,
    'Success; Partial response',
    anyValidator,
  ),
  ...generateResponseMeta(
    ResponseCode.SUCCESS_NO_RESPONSE,
    'Success; No response',
    anyValidator,
  ),
  //
  ...generateErrorMeta(ResponseCode.MULTIPLE_CHOICES, 'Multiple choices'),
  ...generateErrorMeta(ResponseCode.PERMANENTLY_MOVED, 'Permanently moved'),
  ...generateErrorMeta(ResponseCode.FOUND, 'Found'),
  ...generateErrorMeta(ResponseCode.SEE_OTHER, 'See other'),
  ...generateErrorMeta(ResponseCode.NOT_MODIFIED, 'Not modified'),
  ...generateErrorMeta(ResponseCode.TEMPORARY_REDIRECT, 'Temporary redirect'),
  ...generateErrorMeta(ResponseCode.PERMANENT_REDIRECT, 'Permanent redirect'),
  //
  ...generateErrorMeta(ResponseCode.BAD_REQUEST, 'Bad request'),
  ...generateErrorMeta(
    ResponseCode.BAD_REQUEST__INVALID_PARAMS,
    'Bad request: Invalid params',
  ),
  ...generateErrorMeta(
    ResponseCode.BAD_REQUEST__INVALID_RESPONSE,
    'Bad request: Invalid response',
  ),
  //
  ...generateErrorMeta(ResponseCode.NOT_AUTHORIZED, 'Not Authorized'),
  ...generateErrorMeta(
    ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID,
    'Not Authorized: Invalid token',
  ),
  ...generateErrorMeta(
    ResponseCode.NOT_AUTHORIZED__TOKEN_EXPIRED,
    'Not Authorized: Expired token',
  ),
  ...generateErrorMeta(
    ResponseCode.NOT_AUTHORIZED__USER_NOT_FOUND,
    'Not Authorized: User not found',
  ),
  ...generateErrorMeta(
    ResponseCode.NOT_AUTHORIZED__USER_INACTIVE,
    'Not Authorized: User inactive',
  ),
  //
  ...generateErrorMeta(ResponseCode.PAYMENT_REQUIRED, 'Payment required'),
  //
  ...generateErrorMeta(ResponseCode.FORBIDDEN, 'Forbidden'),
  ...generateErrorMeta(
    ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS,
    'Forbidden: Insufficient rights',
  ),
  //
  ...generateErrorMeta(ResponseCode.NOT_FOUND, 'Not found'),
  ...generateErrorMeta(
    ResponseCode.NOT_FOUND__ACTION_NOT_FOUND,
    'Requested endpoint is not found',
  ),
  //
  ...generateErrorMeta(ResponseCode.METHOD_NOT_ALLOWED, 'Method not allowed'),
  ...generateErrorMeta(ResponseCode.NOT_ACCEPTABLE, 'Not acceptable'),
  ...generateErrorMeta(
    ResponseCode.PROXY_AUTHENTICATION_REQUIRED,
    'Proxy authentication required',
  ),
  ...generateErrorMeta(ResponseCode.REQUEST_TIMEOUT, 'Request timeout'),
  ...generateErrorMeta(ResponseCode.CONFLICT, 'Conflict'),
  ...generateErrorMeta(ResponseCode.GONE, 'Gone'),
  ...generateErrorMeta(ResponseCode.LENGTH_REQUIRED, 'Length required'),
  ...generateErrorMeta(ResponseCode.PRECONDITION_FAILED, 'Precondition failed'),
  ...generateErrorMeta(ResponseCode.PAYLOAD_TOO_LARGE, 'Payload too large'),
  ...generateErrorMeta(ResponseCode.URI_TOO_LONG, 'URI too long'),
  ...generateErrorMeta(
    ResponseCode.UNSUPPORTED_MEDIA_TYPE,
    'Unsupported media type',
  ),
  ...generateErrorMeta(
    ResponseCode.RANGE_NOT_SATISFIABLE,
    'Range not satisfiable',
  ),
  ...generateErrorMeta(ResponseCode.EXPECTATION_FAILED, 'Expectation failed'),
  ...generateErrorMeta(ResponseCode.IM_A_TEAPOT, "I'm a teapot"),
  ...generateErrorMeta(ResponseCode.MISDIRECTED_REQUEST, 'Misdirected request'),
  ...generateErrorMeta(
    ResponseCode.UNPROCESSABLE_ENTITY,
    'Unprocessable entity',
  ),
  ...generateErrorMeta(ResponseCode.LOCKED, 'Locked'),
  ...generateErrorMeta(ResponseCode.FAILED_DEPENDENCY, 'Failed dependency'),
  ...generateErrorMeta(ResponseCode.TOO_EARLY, 'Too early'),
  ...generateErrorMeta(ResponseCode.UPGRADE_REQUIRED, 'Upgrade required'),
  ...generateErrorMeta(
    ResponseCode.PRECONDITION_REQUIRED,
    'Precondition required',
  ),
  //
  ...generateErrorMeta(ResponseCode.TOO_MANY_REQUESTS, 'Too many requests'),
  //
  ...generateErrorMeta(
    ResponseCode.REQUEST_HEADER_FIELDS_TOO_LARGE,
    'Request header fields too large',
  ),
  ...generateErrorMeta(
    ResponseCode.UNAVAILABLE_FOR_LEGAL_REASONS,
    'Unavailable for legal reasons',
  ),
  //
  ...generateErrorMeta(ResponseCode.INTERNAL_ERROR, 'Internal server error'),
  //
  ...generateErrorMeta(ResponseCode.NOT_IMPLEMENTED, 'Not implemented'),

  ...generateErrorMeta(ResponseCode.BAD_GATEWAY, 'Bad gateway'),
  ...generateErrorMeta(ResponseCode.SERVICE_UNAVAILABLE, 'Service unavailable'),
  ...generateErrorMeta(ResponseCode.GATEWAY_TIMEOUT, 'Gateway timeout'),
  ...generateErrorMeta(
    ResponseCode.HTTP_VERSION_NOT_SUPPORTED,
    'HTTP version not supported',
  ),
  ...generateErrorMeta(
    ResponseCode.VARIANT_ALSO_NEGOTIATES,
    'Variant also negotiates',
  ),
  ...generateErrorMeta(
    ResponseCode.INSUFFICIENT_STORAGE,
    'Insufficient storage',
  ),
  ...generateErrorMeta(ResponseCode.LOOP_DETECTED, 'Loop detected'),
  ...generateErrorMeta(ResponseCode.NOT_EXTENDED, 'Not extended'),
  ...generateErrorMeta(
    ResponseCode.NETWORK_AUTHENTICATION_REQUIRED,
    'Network authentication required',
  ),
  // OAuth errors
  ...generateErrorMeta(ResponseCode.ACCESS_DENIED, 'Access denied'),
  ...generateErrorMeta(ResponseCode.INSUFFICIENT_SCOPE, 'Insufficient scope'),
  ...generateErrorMeta(ResponseCode.INVALID_ARGUMENT, 'Invalid argument'),
  ...generateErrorMeta(ResponseCode.INVALID_CLIENT, 'Invalid client'),
  ...generateErrorMeta(ResponseCode.INVALID_GRANT, 'Invalid grant'),
  ...generateErrorMeta(ResponseCode.INVALID_REQUEST, 'Invalid request'),
  ...generateErrorMeta(ResponseCode.INVALID_SCOPE, 'Invalid scope'),
  ...generateErrorMeta(ResponseCode.INVALID_TOKEN, 'Invalid token'),
  ...generateErrorMeta(ResponseCode.SERVER_ERROR, 'Server error'),
  ...generateErrorMeta(ResponseCode.UNAUTHORIZED_CLIENT, 'Unauthorized client'),
  ...generateErrorMeta(
    ResponseCode.UNAUTHORIZED_REQUEST,
    'Unauthorized request',
  ),
  ...generateErrorMeta(
    ResponseCode.UNSUPPORTED_GRANT_TYPE,
    'Unsupported grant type',
  ),
  ...generateErrorMeta(
    ResponseCode.UNSUPPORTED_RESPONSE_TYPE,
    'Unsupported response type',
  ),
  ...generateErrorMeta(ResponseCode.REVOKED_TOKEN, 'Revoked token'),
};

// If you see error here - probably you didn't add ResponseCode item to responseMetadata
export type ResponseDataType<Code extends ResponseCode> =
  (typeof responseMetadata)[Code] extends ResponseMeta<Code, infer T>
    ? T
    : never;
