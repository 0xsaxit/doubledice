import axios from 'axios';
import { AutotaskEvent } from 'defender-autotask-utils';
import {
  APP_ORIGIN,
  DISCORD_MAINTAINER_API_KEY
} from './config';

const DISCORD_MAINTAINER_API_ENDPOINT = `${APP_ORIGIN}/api/auto-close-discord`;

export async function handler(event: AutotaskEvent) {
  let data: any;
  try {
    ({ data } = await axios.post(DISCORD_MAINTAINER_API_ENDPOINT, {
      headers: {
        'X-API-Key': DISCORD_MAINTAINER_API_KEY
      }
    }));
  } catch (e: any) {
    if (e.isAxiosError && e.response && e.response.data) {
      console.error(`${e.message}: ${JSON.stringify(e.response.data)}`);
    } else {
      console.error(e.message);
    }
    return;
  }
  console.log(`Response: ${JSON.stringify(data)}`);
}

if (require.main === module) {
  handler({})
    .then(() => process.exit(0))
    .catch((error: Error) => { console.error(error); process.exit(1); });
}
