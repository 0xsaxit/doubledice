import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';

export interface RoomEventInfo {
  category: string;
  subcategory: string;
  title: string;
  description: string;
  isListed: boolean;
  opponents: { title: string; image: string }[];
  outcomes: { index: number; title: string }[];
  resultSources: { title: string; url: string }[];
}


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
  ],
  properties: {
    category: { type: 'string', minLength: 1 },
    subcategory: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    isListed: { type: 'boolean' },
    opponents: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'image'],
        properties: {
          title: { type: 'string', minLength: 1 },
          image: { type: 'string', minLength: 1, format: 'uri' },  // for now a URL, later will be an IPFS content-uri
        },
        additionalProperties: false,
      },
      minItems: 2,
      uniqueItems: true,
    },
    outcomes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index', 'title'],
        properties: {
          index: { type: 'integer', minimum: 0, maximum: 255 },
          title: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
      minItems: 2,
      maxItems: 256,
      uniqueItems: true,
    },
    resultSources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'url'],
        properties: {
          title: { type: 'string', minLength: 1 },
          url: { type: 'string', minLength: 1, format: 'uri' },
        },
        additionalProperties: false,
      },
      minItems: 1,
      uniqueItems: true,
    },
  },
  additionalProperties: false,
};

// ToDo: Extend function so that in addition to JSON validation,
// it also checks that outcome index values are correct and in order,
// category and subcategory match constraints, etc.
export const validateRoomEventInfo = ajv.compile(schema);
