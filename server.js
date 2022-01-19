import Web3 from "web3";
import {
  readFileSync,
  createWriteStream,
} from "fs";
import { resolve } from "path";
import { transferAbi } from "./eventsAbi.js";
import sc from "node-cron";
import { burnToken } from "./burn.js";
const { schedule } = sc;
let fPrice = parseFloat(process.env.FLOOR_PRICE);
let incPercent = parseInt(process.env.FlOOR_INC_PERCENT);
const web3 = new Web3(
  `wss://polygon-${process.env.POLY_NETWORK_NAME}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
);

schedule("* * * * *", () => {
  fPrice = parseFloat((fPrice + (incPercent / 100) * fPrice).toFixed(2));
  let logStream = createWriteStream("floorPriceLogs.txt", { flags: "a" });
  let date = new Date();
  logStream.write(`Current Floor price is ${fPrice} on ${date.toISOString()} \n`);
  logStream.end();
});

const rfContractABI = JSON.parse(
  readFileSync(resolve("./risingFloorABI.json"), "utf-8")
);

const contract = new web3.eth.Contract(
  rfContractABI,
  process.env.RF_CONTRACT_ADDR
);

let options = {
  filter: {
    value: [],
  },
  fromBlock: 0,
};

contract.events
  .Transfer(options)
  .on("data", (event) => processEvent(event))
  .on("changed", (changed) => console.log(changed))
  .on("error", (err) => {
    throw err;
  })
  .on("connected", (str) => console.log(str));

async function processEvent(e) {
  if (
    e.returnValues.from == "0x0000000000000000000000000000000000000000" ||
    e.returnValues.to == "0x0000000000000000000000000000000000000000"
  ) {
    return;
  }

  await decodeLogs(e.transactionHash, e.returnValues.tokenId);
}

async function decodeLogs(txHash, tokenId) {
  // Mainnet and mumbai-testnet have sell price in different logNo in logs Array
  const logNo = process.env.POLY_NETWORK_NAME == "mainnet" ? 7 : 6;

  const receipt = await web3.eth.getTransactionReceipt(txHash);
  if (
    receipt.logs.length < 14 ||
    receipt.logs[logNo].topics[0] !=
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" // Transfer event hex
  ) {
    return;
  }

  const decodedLog = web3.eth.abi.decodeLog(
    transferAbi,
    receipt.logs[logNo].data,
    receipt.logs[logNo].topics.slice(1)
  );

  console.log(decodedLog.value);
  let sellPriceInFinney = parseInt(
    web3.utils.fromWei(decodedLog.value, "finney")
  );

  if (sellPriceInFinney < fPrice) {
    console.log("Below Floor Sell Price in Finney", sellPriceInFinney);
    handleBelowFloorSale(tokenId);
  }
  return;
}

export async function handleBelowFloorSale(tokenId) {
  try {
    let logStream = createWriteStream("belowFloorLogs.txt", { flags: "a" });
    logStream.write(`Token ${tokenId} sold below floor price ${fPrice} \n`);
    logStream.end();
  } catch (e) {
    console.log(
      `ERROR whilst saving below floor sale of token ${tokenId} to file:${e}`
    );
  }

  let result = await burnToken(parseInt(tokenId));
  try {
    if (result.status == true && result.txHash) {
      let logStream = createWriteStream("burnLogs.txt", { flags: "a" });
      logStream.write(
        `Token ${tokenId} burned with txHash ${result.txHash} \n`
      );
      logStream.end();
    } else {
      throw `Failed burn tx`;
    }
  } catch (e) {
    console.log(`ERROR whilst saving burnt token ${tokenId} to file:${e}`);
  }

  return;
}
