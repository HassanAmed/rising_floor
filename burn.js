import Web3 from "web3";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { readFileSync } from "fs";
import { resolve } from "path";

let provider = new HDWalletProvider({
  privateKeys: [process.env.OWNER_PRIVATE_KEY],
  providerOrUrl: `https://polygon-${process.env.POLY_NETWORK_NAME}.infura.io/v3/${process.env.INFURA_API_KEY}`,
});
const web3 = new Web3(provider);

const rfContractABI = JSON.parse(
  readFileSync(resolve("./risingFloorABI.json"), "utf-8")
);

const contract = new web3.eth.Contract(
  rfContractABI,
  process.env.RF_CONTRACT_ADDR
);

let options = {
  from: process.env.OWNER_ADDR,
  gasPrice: web3.utils.toHex(web3.utils.toWei("100", "gwei")),
  gas: web3.utils.toHex(150000),
};

export async function burnToken(tokenId) {
  return new Promise((resolve, _reject) => {
    let response = {
      status: false,
      txHash: null,
      blockHash: null,
      blockNumber: null,
      error: { status: false, msg: null },
    };
    contract.methods
      .burnToken(tokenId)
      .send(options)
      .on("receipt", function (receipt) {
        if (
          receipt.status == true &&
          receipt.transactionHash &&
          receipt.blockHash &&
          receipt.blockNumber
        ) {
          response.status = receipt.status;
          response.txHash = receipt.transactionHash;
          response.blockHash = receipt.blockHash;
          response.blockNumber = receipt.blockNumber;
        }
        resolve(response);
      })
      .on("error", function (error, receipt) {
        // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
        // console.log("Error Encountered", error);
        if (error) {
          response.error.status = true;
          response.error.msg = error;
        }
        resolve(response);
      });
  });
}
