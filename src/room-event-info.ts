import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv();
addFormats(ajv);

export interface EventInfo {
  category: string;
  subcategory: string;
  title: string;
  description: string;
  visibility: 'public' | 'unlisted';
  opponents: { title: string; image: string }[];
  outcomes: { index: number; title: string }[];
  resultSources: { title: string; url: string }[];
}

const schema: JSONSchemaType<EventInfo> = {
  type: 'object',
  required: [
    'category',
    'subcategory',
    'title',
    'description',
    'visibility',
    'opponents',
    'outcomes',
    'resultSources',
  ],
  properties: {
    category: { type: 'string', minLength: 1 },
    subcategory: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    visibility: { type: 'string', enum: ['public', 'unlisted'] },
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
          index: { type: 'integer', minimum: 1, maximum: 255 },
          title: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
      minItems: 2,
      maxItems: 255,
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

export const validateEventInfo = ajv.compile(schema);
