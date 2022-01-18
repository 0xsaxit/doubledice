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
  try {
    const {
      queryStringParameters,
      httpMethod,
      body,
    } = event;

    if (queryStringParameters === null) {
      throw new Error('!');
    }

    const { action } = queryStringParameters as { action?: 'validate' };

    if (httpMethod === 'POST' && action === 'validate') {

      if (typeof body !== 'string') {
        throw new Error('!');
      }

      const isValid = validateEventInfo(JSON.parse(body));

      if (isValid) {
        return jsonResponse(200, {
          valid: true,
        });
      } else {
        return jsonResponse(400, {
          valid: false,
          errors: validateEventInfo.errors,
        });
      }
    } else {
      return jsonResponse(500, {
        error: 'Error',
      });
    }

  } catch (e: any) {
    return jsonResponse(500, {
      error: e.stack.split('\n'),
    });
  }
};