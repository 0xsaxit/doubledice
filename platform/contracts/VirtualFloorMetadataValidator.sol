// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./BaseDoubleDice.sol";
import "./library/Utils.sol";

struct VirtualFloorMetadataOpponents {
    string[] titles;
    string[] images;
}

struct VirtualFloorMetadataOutcomes {
    string[] titles;
}

struct VirtualFloorMetadataResultSources {
    string[] titles;
    string[] urls;
}

struct VirtualFloorMetadataV1 {
    string category;
    string subcategory;
    string title;
    string description;
    bool isListed;
    VirtualFloorMetadataOpponents opponents;
    VirtualFloorMetadataOutcomes outcomes;
    VirtualFloorMetadataResultSources resultSources;
    string discordChannelId;
}

contract VirtualFloorMetadataValidator is BaseDoubleDice {

    using Utils for string;

    function __VirtualFloorMetadataValidator_init(BaseDoubleDiceInitParams calldata params) internal onlyInitializing {
        __BaseDoubleDice_init(params);
    }

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal virtual override {
        uint256 version = uint256(params.metadata.version);
        require(version == 1);
        (VirtualFloorMetadataV1 memory metadata) = abi.decode(params.metadata.data, (VirtualFloorMetadataV1));

        // Temporary until workaround is removed
        require(metadata.opponents.titles.length == metadata.opponents.images.length, "Error: Mismatched opponents lengths");
        require(metadata.resultSources.titles.length == metadata.resultSources.urls.length, "Error: Mismatched resultSources lengths");

        // `nOutcomes` could simply be taken to be `metadata.outcomes.length` and this `require` could then be dropped.
        // But for now we choose to make a clear distinction between "essential" data (that needs to be stored on-chain)
        // and "non-essential" data (data that we want to commit to and that is required in the frontend,
        // but that is is not essential for the operation of the smart-contract).
        // To this end, we group all non-essential data in the `metadata` parameter,
        // we require a separate `nOutcomes` "essential" argument to be passed,
        // and we enforce consistency with this check.
        require(metadata.outcomes.titles.length == params.nOutcomes, "Error: Outcomes length mismatch");

        require(metadata.opponents.titles.length >= 1, "Error: There must be at least 1 opponent");

        require(metadata.resultSources.titles.length >= 1, "Error: There must be at least 1 result source");

        require(!metadata.title.isEmpty(), "Error: Title cannot be empty");

        require(!metadata.description.isEmpty(), "Error: Description cannot be empty");

        // ToDo: Here we should proceed to validate individual array item metadata,
        // but this is going to waste even more gas.
        // For now we skip it, just in case we come up with a better solution.
        // An alternative solution could be to validate nothing here, and then simply perform the validation in the
        // graph-indexer (mapping.ts) and simply do not index virtual-floors created with invalid metadata.
        // If we adopt this strategy, we could drop even the few checks made above.

        require(!metadata.discordChannelId.isEmpty(), "Error: discordChannelId cannot be empty");
    }

    /// @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
