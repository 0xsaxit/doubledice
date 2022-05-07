export const DD_ENV = process.env.DD_ENV;

if (!(DD_ENV === 'beta' || DD_ENV === 'live')) {
  throw new Error(`Unexpected DD_ENV "${DD_ENV}"; must be "beta" or "live"`);
}

const configs = {
  beta: {
    GRAPHQL_ENDPOINT: 'https://api.thegraph.com/subgraphs/name/doubledicedev/doubledice-mumbai2',
    APP_ORIGIN: 'https://beta.doubledice.com',
    // See https://doubledice.slack.com/services/B03AUCBPLJU
    SLACK_WEBHOOK_ENDPOINT: 'https://hooks.slack.com/services/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',
    BLOCK_EXPLORER_HOST: 'https://mumbai.polygonscan.com',
    DOUBLEDICE_CONTRACT_ADDRESS: '0x5848A6Df71aE96e9C7544fC07815Ab5B13530c6b',
    LOG_NO_ACTION: false,
  },
  live: {
    GRAPHQL_ENDPOINT: 'https://api.thegraph.com/subgraphs/name/ddvfs-com/ddvfs-polygon',
    APP_ORIGIN: 'https://ddvfs.com',
    // See https://doubledice.slack.com/services/B03AUCBPLJU
    SLACK_WEBHOOK_ENDPOINT: 'https://hooks.slack.com/services/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',
    BLOCK_EXPLORER_HOST: 'https://polygonscan.com',
    DOUBLEDICE_CONTRACT_ADDRESS: '0x29370D56050FaA11f971B9b7Dc498c99Fd57fEc7',
    LOG_NO_ACTION: false,
  },
};

const {
  GRAPHQL_ENDPOINT,
  APP_ORIGIN,
  SLACK_WEBHOOK_ENDPOINT,
  BLOCK_EXPLORER_HOST,
  DOUBLEDICE_CONTRACT_ADDRESS,
  LOG_NO_ACTION,
} = configs[DD_ENV];

export {
  GRAPHQL_ENDPOINT,
  APP_ORIGIN,
  SLACK_WEBHOOK_ENDPOINT,
  BLOCK_EXPLORER_HOST,
  DOUBLEDICE_CONTRACT_ADDRESS,
  LOG_NO_ACTION,
};
