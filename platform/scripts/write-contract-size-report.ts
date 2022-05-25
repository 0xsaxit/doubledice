import { writeFileSync } from 'fs';
import { TASK_COMPILE } from 'hardhat/builtin-tasks/task-names';
import { task } from 'hardhat/config';

task(TASK_COMPILE).setAction(async (_, { ethers, artifacts }, runSuper) => {
  await runSuper();
  const { deployedBytecode } = await artifacts.readArtifact('DoubleDice');

  const msg = `\
DoubleDice size: ${ethers.utils.hexDataLength(deployedBytecode)} bytes
Limit:           24576 bytes
`;
  process.stdout.write(msg);
  writeFileSync('./contract-size-report.txt', msg);
});
