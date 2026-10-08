// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ITIP20 {
    function transferWithMemo(address to, uint256 amount, bytes32 memo) external;
    function transferFromWithMemo(address from, address to, uint256 amount, bytes32 memo)
        external returns (bool);
    function transferPolicyId() external view returns (uint64);
    function paused() external view returns (bool);
}
