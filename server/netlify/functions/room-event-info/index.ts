import { Handler, HandlerResponse } from '@netlify/functions';
import * as ipfs from 'ipfs-http-client';
import { validateRoomEventInfo } from '../../../../platform/room-event-info/common';

const IPFS_HOST = 'localhost';
const IPFS_PORT = 5001;

const jsonResponse = (statusCode: HandlerResponse['statusCode'], data: Record<string, unknown>): HandlerResponse => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(data),
  };
};

// We define it here to avoid importing ethers.js (yet) just for this
const hexlify = (bytes: Uint8Array): string => `0x${Buffer.from(bytes).toString('hex')}`;

export const handler: Handler = async (event, context) => {
  const {
    queryStringParameters,
    httpMethod,
    body,
    headers,
  } = event;

  // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    };
  }

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

  let roomEventInfo;
  try {
    roomEventInfo = JSON.parse(body);
  } catch (e) {
    return jsonResponse(400, { error: 'Error trying to parse body as JSON' });
  }

  const isValid = validateRoomEventInfo(roomEventInfo);

  if (!isValid) {
    return jsonResponse(400, {
      valid: false,
      errors: validateRoomEventInfo.errors,
    });
  }

  if (action === 'validate') {
    return jsonResponse(200, {
      valid: true,
    });
  } else {
    const content = JSON.stringify(roomEventInfo);

    const ipfsHttpClient = ipfs.create({ host: IPFS_HOST, port: IPFS_PORT });
    let cid: ipfs.CID;
    try {
      // Will fail with "ReferenceError: AbortController is not defined" if you aren't using NodeJS v16
      ({ cid } = await ipfsHttpClient.add(content, { rawLeaves: true }));
    } catch (e: any) {
      return jsonResponse(500, { error: e.toString() });
    }
    const metadataHash = hexlify(cid.multihash.digest);
    return jsonResponse(200, {
      valid: true,
      metadataHash,
    });
  }
};
