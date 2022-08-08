require('dotenv').config({ path: './.env' });
const { augustusFromAmountOffsetFromCalldata } = require('./augustus');
const { default: axios } = require("axios");
const { ethers } = require("ethers");
const provider = new ethers.providers.WebSocketProvider(process.env.MAINNET_WEBSOCKET_INFURA_KEY);

let oneEther = 1000000000000000000;
const mywallet = "0xEA4b59E3B055037E994a447E612fe449227986bB";
const fladdress = "0x48C4EB1E04a7Fa3c10Baf69408385052974bc649";
const flabi = ["function flash_loan(address _asset1, address _asset2, uint256 _amount1, uint256 _fromAmountOffset, bytes memory _swapCallData, bytes memory _data)"];
let wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const flashloan = new ethers.Contract(fladdress, flabi, provider);
const _dai = "0x6b175474e89094c44da98b954eedeac495271d0f";
const _weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const _amountDai = "2000000000000000000000";

async function init() {
    let ethPrice;
        const results = await axios.get(
            'https://api.1inch.exchange/v4.0/1/swap?' +
            'fromTokenAddress=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&' +
            'toTokenAddress=0x6b175474e89094c44da98b954eedeac495271d0f&' +
            'amount=1000000000000000000&fromAddress=' +
            '0x48C4EB1E04a7Fa3c10Baf69408385052974bc649&slippage=2&disableEstimate=true'
        )
        ethPrice = (results.data.toTokenAmount / oneEther);

    let inch = await axios.get(
        'https://api.1inch.exchange/v4.0/1/swap?' +
        'fromTokenAddress=0x6b175474e89094c44da98b954eedeac495271d0f&' +
        'toTokenAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&' +
        'amount=2000000000000000000000&fromAddress=' +
        '0x48C4EB1E04a7Fa3c10Baf69408385052974bc649&slippage=2&disableEstimate=true')
    //get amount of token transferred to
    let amount = inch.data.toTokenAmount;

    //paraswap api call /prices with amount out from 1inch as swap amount
    let para = await axios.get(
        'https://apiv5.paraswap.io/prices?' +
        'srcToken=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&srcDecimals=18&' +
        'destToken=0x6b175474e89094c44da98b954eedeac495271d0f&destDecimals=18&' +
        'amount=' + `${amount}` +
        '&side=SELL&network=1&userAddress=0x48C4EB1E04a7Fa3c10Baf69408385052974bc649')


        
    //get priceRoute to send for /transactions endpoint 
    let paraswapData = para.data.priceRoute;

    //set parameters for /transactions endpoint
    let params = {
        srcToken: para.data.priceRoute.srcToken,
        destToken: para.data.priceRoute.destToken,
        srcDecimals: para.data.priceRoute.srcDecimals,
        destDecimals: para.data.priceRoute.destDecimals,
        srcAmount: para.data.priceRoute.srcAmount,
        priceRoute: paraswapData,
        slippage: 3,
        userAddress: fladdress, // the address of smart contract that will call PARASWAP contract (Swapper address)
        txOrigin: mywallet, // the address of the wallet that will send the transaction
        receiver: fladdress, // the address of the wallet that will receive the output amount of the swap, in my case receiver is Swapper contract
    }
    //make the requeest to the /transactions endpoint
    let responseTXBuild = await axios.post('https://apiv5.paraswap.io/transactions/1?ignoreChecks=true', params) 
    let _data = inch.data.tx.data;
    //prep the calldata from paraswap
    let _swapCallData = responseTXBuild.data.data;
  
    let amountOut = (para.data.priceRoute.destAmount / oneEther);

    let feeData = await provider.getFeeData();

    let gasPrice = ethers.utils.formatUnits(feeData.maxFeePerGas, "wei");
    let _fromAmountOffset = augustusFromAmountOffsetFromCalldata(_swapCallData);
    const flashloansigner = flashloan.connect(wallet);
    let gasCost = await flashloan.estimateGas.flash_loan(
        _dai, 
        _weth, 
        _amountDai, 
        _fromAmountOffset, 
        _swapCallData, 
        _data,{from: mywallet}
    ); 
    let txCost = ((gasPrice * gasCost) * 1.5);
    let gasInDai = ((txCost * ethPrice) / oneEther);
    let totalCost = gasInDai + 2018;
    let profit = amountOut - totalCost;

    let _gasLimit = (gasCost * 1.5);
    let _gasPrice = (gasPrice * 1.5);
    

    if(profit > 20) {
        const tx = await flashloansigner.flash_loan(
            _dai, 
            _weth, 
            _amountDai, 
            _fromAmountOffset, 
            _swapCallData, 
            _data, 
            {
                gasLimit: _gasLimit,
                gasPrice: _gasPrice,
            }
        );
        await tx.wait();
    } else {
        console.log(amountOut)
        console.log("Profit would be " + profit + "." + " Tx cost = " + gasInDai + " Dai.");
    }

    setTimeout(init, 1500);
}

init();