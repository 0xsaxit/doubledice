// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

contract MultipleInheritanceOptimization {

    bool internal _rootInitialized;

    modifier multipleInheritanceRootInitializer() {
        if (!_rootInitialized) {
            _rootInitialized = true;
            _;
        }
    }

    modifier multipleInheritanceLeafInitializer() {
        _;
        _rootInitialized = false;
    }

}
