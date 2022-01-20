import assert from 'assert';
import axios from 'axios';
import { RoomEventInfo, validateRoomEventInfo } from './common';

export class RoomEventInfoClient {

  constructor(private origin: string = 'http://localhost:8888') {
  }

  async submitRoomEventInfo(roomEventInfo: RoomEventInfo): Promise<string> {

    assert(validateRoomEventInfo(roomEventInfo));

    const rsp = await axios.post(`${this.origin}/api/room-event-info?action=submit`, roomEventInfo);

    if (rsp.status === 200) {
      const { metadataHash } = rsp.data as { metadataHash: string };
      return metadataHash;
    } else {
      const { errors } = rsp.data as { errors: any[] };
      console.error(errors);
      throw new Error(JSON.stringify(errors));
    }
  }

}


export { validateRoomEventInfo };
export type { RoomEventInfo };


