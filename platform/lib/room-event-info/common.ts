import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import { RoomEventInfo } from '../contracts';

const ajv = new Ajv();
addFormats(ajv);

const schema: JSONSchemaType<RoomEventInfo> = {
  type: 'object',
  required: [
    'category',
    'subcategory',
    'title',
    'description',
    'isListed',
    'opponents',
    'outcomes',
    'resultSources',
    'discordChannelId',
  ],
  properties: {
    category: { type: 'string', minLength: 1 },
    subcategory: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    isListed: { type: 'boolean' },
    opponents: {
      type: 'object',
      required: ['titles', 'images'],
      properties: {
        titles: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
          uniqueItems: true
        },
        images: {
          type: 'array',
          items: { type: 'string', minLength: 1, format: 'uri' },
          minItems: 1,
          uniqueItems: true
        },  // for now a URL, later will be an IPFS content-uri
      },
      additionalProperties: false,
    },
    outcomes: {
      type: 'object',
      required: ['titles'],
      properties: {
        titles: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 2,
          maxItems: 256,
          uniqueItems: true,
        }
      },
      additionalProperties: false,
    },
    resultSources: {
      type: 'object',
      required: ['titles', 'urls'],
      properties: {
        titles: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
          uniqueItems: true,
        },
        urls: {
          type: 'array',
          items: { type: 'string', minLength: 1, format: 'uri' },
          minItems: 1,
          uniqueItems: true,
        },
      },
      additionalProperties: false,
    },
    discordChannelId: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};
// ToDo: Extend function so that in addition to JSON validation,
// it also checks that outcome index values are correct and in order,
// category and subcategory match constraints, etc.
export const validateRoomEventInfo = ajv.compile(schema);
