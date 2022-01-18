import { Handler, HandlerResponse } from '@netlify/functions';
import { validateEventInfo } from '../../../src/room-event-info';

const jsonResponse = (statusCode: HandlerResponse['statusCode'], data: Record<string, unknown>): HandlerResponse => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
};

export const handler: Handler = async (event, context) => {
  const {
    queryStringParameters,
    httpMethod,
    body,
    headers,
  } = event;

  if (httpMethod !== 'POST') {
    return jsonResponse(405, { error: `HTTP method ${httpMethod} != POST` });
  }

  if (queryStringParameters === null) {
    return jsonResponse(400, { error: 'Query params cannot be null' });
  }

  const contentType = headers['content-type'];
  if (contentType !== 'application/json') {
    return jsonResponse(400, { error: 'Request `Content-Type` header must specify `application/json`' });
  }

  if (body === null) {
    return jsonResponse(400, { error: 'Request body cannot be null' });
  }

  const { action } = queryStringParameters as { action?: string };

  if (!(action === 'validate' || action === 'submit')) {
    return jsonResponse(400, { error: 'Query param `action` must be `validate` or `submit`' });
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return jsonResponse(400, { error: 'Error trying to parse body as JSON' });
  }

  const isValid = validateEventInfo(parsed);

  if (!isValid) {
    return jsonResponse(400, {
      valid: false,
      errors: validateEventInfo.errors,
    });
  }

  if (action === 'validate') {
    return jsonResponse(200, {
      valid: true,
    });
  } else {
    return jsonResponse(200, {
      valid: true,
    });
  }
};
