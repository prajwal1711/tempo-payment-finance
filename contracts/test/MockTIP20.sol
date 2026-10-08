// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockTIP20 is ERC20 {
    bool public failTransfers;
    event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo);
    constructor() ERC20("AlphaUSD", "AlphaUSD") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setFailTransfers(bool value) external { failTransfers = value; }
    function transfer(address to, uint256 amount) public override returns (bool) {
        require(!failTransfers, "Mock transfer blocked");
        return super.transfer(to, amount);
    }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(!failTransfers, "Mock transfer blocked");
        return super.transferFrom(from, to, amount);
    }
    function transferWithMemo(address to, uint256 amount, bytes32 memo) external {
        transfer(to, amount);
        emit TransferWithMemo(msg.sender, to, amount, memo);
    }
    function transferFromWithMemo(address from, address to, uint256 amount, bytes32 memo) external returns (bool) {
        transferFrom(from, to, amount);
        emit TransferWithMemo(from, to, amount, memo);
        return true;
    }
}
