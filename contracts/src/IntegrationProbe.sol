// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ITIP20} from "./ITIP20.sol";

contract IntegrationProbe {
    using SafeERC20 for IERC20;
    IERC20 public immutable asset;
    constructor(IERC20 token) {
        require(IERC20Metadata(address(token)).decimals() == 6, "Unexpected decimals");
        asset = token;
    }
    function roundTrip(uint256 amount) external {
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        require(asset.balanceOf(address(this)) == beforeBalance + amount, "Incorrect received amount");
        asset.safeTransfer(msg.sender, amount);
        require(asset.balanceOf(address(this)) == beforeBalance, "Incorrect returned amount");
    }
    function memoRoundTrip(uint256 amount, bytes32 memo) external {
        uint256 beforeBalance = asset.balanceOf(address(this));
        require(ITIP20(address(asset)).transferFromWithMemo(msg.sender, address(this), amount, memo));
        require(asset.balanceOf(address(this)) == beforeBalance + amount, "Incorrect received amount");
        ITIP20(address(asset)).transferWithMemo(msg.sender, amount, memo);
        require(asset.balanceOf(address(this)) == beforeBalance, "Incorrect returned amount");
    }
    function fail() external pure { revert("Intentional batch rollback"); }
}

contract VaultShell is ERC4626 {
    constructor(IERC20 token) ERC20("Probe Vault Share", "pVS") ERC4626(token) {
        require(IERC20Metadata(address(token)).decimals() == 6, "Unexpected decimals");
        require(decimals() == 18, "Unexpected share decimals");
    }
    function _decimalsOffset() internal pure override returns (uint8) { return 12; }
}
