// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../VirtualFloorMetadataValidator.sol";

interface IVirtualFloorMetadataVersionsMock {

    // These events are never really emitted per se,
    // but VirtualFloorCreated events will exist that have
    // emitted metadata in abi-encoded form,
    // so they are included here to coax the Graph code-generator
    // into generating wrappers for them.
    event VirtualFloorMetadata(
        VirtualFloorMetadataV1 v1
    );

    function v1(VirtualFloorMetadataV1 calldata value) external;
}
