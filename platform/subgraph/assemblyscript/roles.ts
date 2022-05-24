/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import {
  store
} from '@graphprotocol/graph-ts';
import {
  RoleGranted as RoleGrantedEvent,
  RoleRevoked as RoleRevokedEvent
} from '../../generated/DoubleDice/DoubleDice';
import {
  RoleUser
} from '../../generated/schema';
import {
  assertRoleEntity,
  assertUserEntity,
  createNewEntity,
  loadExistentEntity
} from './entities';

export function handleRoleGranted(event: RoleGrantedEvent): void {
  const role = assertRoleEntity(event.params.role);
  const user = assertUserEntity(event.params.account);
  const roleUser = createNewEntity<RoleUser>(RoleUser.load, `${role.id}-${user.id}`);
  roleUser.role = role.id;
  roleUser.user = user.id;
  roleUser.save();
}

export function handleRoleRevoked(event: RoleRevokedEvent): void {
  const role = assertRoleEntity(event.params.role);
  const user = assertUserEntity(event.params.account);
  const roleUser = loadExistentEntity<RoleUser>(RoleUser.load, `${role.id}-${user.id}`);
  // https://thegraph.com/docs/en/developer/assemblyscript-api/#removing-entities-from-the-store
  store.remove('RoleUser', roleUser.id);
}
