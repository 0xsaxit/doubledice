// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

struct VirtualFloorMetadataOpponent {
    string title;
    string image;
}

struct VirtualFloorMetadataOutcome {
    string title;
}

struct VirtualFloorMetadataResultSource {
    string title;
    string url;
}

struct VirtualFloorMetadata {
    string category;
    string subcategory;
    string title;
    string description;
    bool isListed;
    VirtualFloorMetadataOpponent[] opponents;
    VirtualFloorMetadataOutcome[] outcomes;
    VirtualFloorMetadataResultSource[] resultSources;
}

function _requireValidMetadata(uint256 nOutcomes, VirtualFloorMetadata calldata metadata) pure {
    // `nOutcomes` could simply be taken to be `metadata.outcomes.length` and this `require` could then be dropped.
    // But for now we choose to make a clear distinction between "essential" data (that needs to be stored on-chain)
    // and "non-essential" data (data that we want to commit to and that is required in the frontend,
    // but that is is not essential for the operation of the smart-contract).
    // To this end, we group all non-essential data in the `metadata` parameter,
    // we require a separate `nOutcomes` "essential" argument to be passed,
    // and we enforce consistency with this check.
    require(metadata.outcomes.length == nOutcomes, "Error: Outcomes length mismatch");

    require(metadata.opponents.length >= 1, "Error: There must be at least 1 opponent");

    // ToDo: Should we require(metadata.outcomes.length >= metadata.opponents.length)?
    require(metadata.outcomes.length >= 2, "Error: There must be at least 2 outcomes");

    require(metadata.resultSources.length >= 1, "Error: There must be at least 1 result source");

    require(bytes(metadata.title).length > 0, "Error: Title cannot be empty");

    require(bytes(metadata.description).length > 0, "Error: Description cannot be empty");

    // ToDo: Here we should proceed to validate individual array item metadata,
    // but this is going to waste even more gas.
    // For now we skip it, just in case we come up with a better solution.
    // An alternative solution could be to validate nothing here, and then simply perform the validation in the
    // graph-indexer (mapping.ts) and simply do not index virtual-floors created with invalid metadata.
    // If we adopt this strategy, we could drop even the few checks made above.
}
