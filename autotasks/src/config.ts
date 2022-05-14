export const DD_ENV = process.env.DD_ENV;

if (!(DD_ENV === 'dev' || DD_ENV === 'beta' || DD_ENV === 'live')) {
  throw new Error(`Unexpected DD_ENV "${DD_ENV}"; must be "dev" or "beta" or "live"`);
}

const configs = {
  dev: {
    GRAPHQL_ENDPOINT: 'https://api.thegraph.com/subgraphs/name/doubledicedev/doubledice-mumbai',
    APP_ORIGIN: 'https://dd-mumbai-dev.netlify.app',
    // See https://doubledice.slack.com/services/B03AUCBPLJU
    SLACK_WEBHOOK_ENDPOINT: 'https://hooks.slack.com/services/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',
    BLOCK_EXPLORER_HOST: 'https://mumbai.polygonscan.com',
    DOUBLEDICE_CONTRACT_ADDRESS: '0xCE3CD58c9600B942a66B04e55CC81e27395b4555',
    LOG_NO_ACTION: false,
    // Generated once via hexlify(randomBytes(32)).slice(2)
    DISCORD_MAINTAINER_API_KEY: '41b6fd05d9c050c0695d635e6ed9f47c023be9a8354107f3c0e38c466a25ea40',
  },
  beta: {
    GRAPHQL_ENDPOINT: 'https://api.thegraph.com/subgraphs/name/doubledicedev/doubledice-mumbai2',
    APP_ORIGIN: 'https://beta.doubledice.com',
    // See https://doubledice.slack.com/services/B03AUCBPLJU
    SLACK_WEBHOOK_ENDPOINT: 'https://hooks.slack.com/services/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',
    BLOCK_EXPLORER_HOST: 'https://mumbai.polygonscan.com',
    DOUBLEDICE_CONTRACT_ADDRESS: '0x5848A6Df71aE96e9C7544fC07815Ab5B13530c6b',
    LOG_NO_ACTION: false,
    // Generated once via hexlify(randomBytes(32)).slice(2)
    DISCORD_MAINTAINER_API_KEY: 'cc2531ddbc006bae87b129db3022d2fee593d7c4129deca1672154753a69a2ef',
  },
  live: {
    GRAPHQL_ENDPOINT: 'https://api.thegraph.com/subgraphs/name/ddvfs-com/ddvfs-polygon',
    APP_ORIGIN: 'https://ddvfs.com',
    // See https://doubledice.slack.com/services/B03AUCBPLJU
    SLACK_WEBHOOK_ENDPOINT: 'https://hooks.slack.com/services/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',
    BLOCK_EXPLORER_HOST: 'https://polygonscan.com',
    DOUBLEDICE_CONTRACT_ADDRESS: '0x29370D56050FaA11f971B9b7Dc498c99Fd57fEc7',
    LOG_NO_ACTION: false,
    // Generated once via hexlify(randomBytes(32)).slice(2)
    DISCORD_MAINTAINER_API_KEY: '15b43972271fb4ed1735bc84d10444565e321eab29666e48830b695c0aba2477',
  },
};

const {
  GRAPHQL_ENDPOINT,
  APP_ORIGIN,
  SLACK_WEBHOOK_ENDPOINT,
  BLOCK_EXPLORER_HOST,
  DOUBLEDICE_CONTRACT_ADDRESS,
  LOG_NO_ACTION,
  DISCORD_MAINTAINER_API_KEY,
} = configs[DD_ENV];

export {
  GRAPHQL_ENDPOINT,
  APP_ORIGIN,
  SLACK_WEBHOOK_ENDPOINT,
  BLOCK_EXPLORER_HOST,
  DOUBLEDICE_CONTRACT_ADDRESS,
  LOG_NO_ACTION,
  DISCORD_MAINTAINER_API_KEY,
};
