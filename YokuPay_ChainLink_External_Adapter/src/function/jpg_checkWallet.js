const { Requester, Validator } = require("@chainlink/external-adapter");
const abi_YokuPay = require("../assets/abi.json").abi;
const abiDecoder = require("abi-decoder");
const axios = require("axios");
const Web3 = require("web3");
require("dotenv").config();

const { pool } = require("../assets/Database");

let jobRunID = 200;

const checkWallet = async (input, callback) => {
  try {
    console.log("Start check, with TransactionHash: ", input.data.txh);
    console.log(input.data);

    // Request current ADA - MATIC exchange rate
    const cryptoResponse = await axios.get(
      `https://min-api.cryptocompare.com/data/price?fsym=ADA&tsyms=MATIC&api_key={1c4ac91e6cfe6b26fdb17cd046918a29aff4d7957c32f1c1df6109ad68ad2e1c}`
    );
    console.log(cryptoResponse.data.MATIC);
    const adaMatic = toNumberString(cryptoResponse.data.MATIC * 10 ** 18); // convert to wei

    // Get the NFT data of the receipt NFT
    const nftData = await getNFTData(input.data.txh); 
    console.log(nftData);

    // if no NFT Data is available
    if (nftData.data === "none") {
      console.log("Keine Daten vorhanden");
      try {
        const deleteJob = await pool.query(
          `DELETE FROM jpg_joblist WHERE transactionhash='${input.data.txh}';`
        );
      } catch (error) {
        console.log(error);
      }
      const result = Web3.utils.asciiToHex(
        "0x" + input.data.user + "4" + adaMatic
      );
      console.log("Result: ", "0x" + input.data.user + "4" + adaMatic);
      // callback with result number 4 (no data available)
      const response = { data: { result: result }, status: 200 };
      callback(jobRunID, Requester.success(jobRunID, response));
      return;
    }
    console.log(
      nftData.data.EthereumAddress === "0x" + input.data.user,
      nftData.contract === process.env.NFT_CONTRACT,
      nftData.data.AssetID !== undefined,
      nftData.data.CardanoAddress !== undefined,
      nftData.data.CardanoStakeAddress !== undefined,
      nftData.data.EthereumAddress !== undefined,
      nftData.data.Time !== undefined
    );
    if (
      nftData.data.EthereumAddress === "0x" + input.data.user &&
      nftData.contract === process.env.NFT_CONTRACT &&
      nftData.data.AssetID !== undefined &&
      nftData.data.CardanoAddress !== undefined &&
      nftData.data.CardanoStakeAddress !== undefined &&
      nftData.data.EthereumAddress !== undefined &&
      nftData.data.Time !== undefined
    ) {
      // if Data available, check the useres wallet for the bought NFT
      const walletData = await checkWalletAPI(
        nftData.data.CardanoAddress,
        nftData.data.AssetID,
      );

      if (walletData.status === 200) {
        // if NFT exists in the users Wallet 
        const user = nftData.data.EthereumAddress;

        if (walletData.walletStatus) {
          const deleteJob = await pool.query(
            `DELETE FROM jpg_joblist WHERE transactionhash='${input.data.txh}';`
          );
          console.log(user + "2" + adaMatic);
          const result = Web3.utils.asciiToHex(user + "2" + adaMatic);
          const response = { data: { result: result }, status: 200 };
          // callback with result number 2 (NFT in users wallet)
          callback(jobRunID, Requester.success(jobRunID, response));
        } else {
          // else check if time for NFT transfer is expired
          const checkTime = await pool.query(
            `SELECT * FROM jpg_joblist WHERE transactionhash='${input.data.txh}';`
          );
          const currentTime = Math.floor(new Date().getTime() / 1000.0);

          // ____________________________________________________
          // *** for Unit Tests ***
            const timeRemove = currentTime + 100
          // *** for Production ***
          // const timeRemove = checkTime.rows[0].first + 86400;
          // ____________________________________________________

          if (timeRemove <= currentTime) {
            const deleteJob = await pool.query(
              `DELETE FROM jpg_joblist WHERE transactionhash='${input.data.txh}';`
            );
            console.log(user + "3" + adaMatic);
            const result = Web3.utils.asciiToHex(user + "3" + adaMatic);
            const response = { data: { result: result }, status: 200 };
            // callback with result number 3 (NFT does not exist in the users wallet and time expired)
            callback(jobRunID, Requester.success(jobRunID, response));
          } else {
            const deleteJob = await pool.query(
              `UPDATE jpg_joblist
              SET execute = ${currentTime + 3600}, process= ${false}
              WHERE transactionhash='${input.data.txh}';`
            );
            console.log(user + "1" + adaMatic);
            const result = Web3.utils.asciiToHex(user + "1" + adaMatic);
            const response = { data: { result: result }, status: 200 };
            // callback with result number 1 (NFT does not exist in the users wallet (retry))
            callback(jobRunID, Requester.success(jobRunID, response));
          }
        }
      } else {
        const currentTime = Math.floor(new Date().getTime() / 1000.0);
        const deleteJob = await pool.query(
          `UPDATE jpg_joblist
        SET execute = ${currentTime + 3600}, process= ${false}
        WHERE transactionhash='${input.data.txh}';`
        );
        console.log("Not inside");
        console.log(user + "1" + adaMatic);
        const result = Web3.utils.asciiToHex(user + "1" + adaMatic);
        const response = { data: { result: result }, status: 200 };
        // callback with result number 1 (NFT does not exist in the users wallet (retry))
        callback(jobRunID, Requester.success(jobRunID, response));
      }
    } else {
      console.log("Daten stimmen nicht überein");
      try {
        const deleteJob = await pool.query(
          `DELETE FROM jpg_joblist WHERE transactionhash='${input.data.txh}';`
        );
      } catch (error) {
        console.log(error);
      }
      const result = Web3.utils.asciiToHex(
        "0x" + input.data.user + "4" + adaMatic
      );
      console.log("Result: ", "0x" + input.data.user + "4" + adaMatic);
      const response = { data: { result: result }, status: 200 };
      // callback with result number 4 (malicious receipt NFT)
      callback(jobRunID, Requester.success(jobRunID, response));
    }
  } catch (error) {
    console.log(error);
    callback(400, Requester.errored(jobRunID, error));
  }
};

// Get NFT data function
async function getNFTData(hash) {
  abiDecoder.addABI(abi_YokuPay);
  try {
    var web3 = new Web3("https://polygon-rpc.com/");

    const responseSecond = await web3.eth.getTransaction(hash);

    const inputData = responseSecond.input;
    const contractUsed = responseSecond.to;

    const testData = inputData;
    const inputDecodeFull = abiDecoder.decodeMethod(testData);

    const ipfsLink =
      inputDecodeFull.params[inputDecodeFull.params.length - 1].value;

    const responseIPFS = await axios.get(
      "https://gateway.ipfs.io/ipfs/" + ipfsLink
    );

    return { data: responseIPFS.data, contract: contractUsed };
  } catch (error) {
    console.log(error);
    return { data: "none" };
  }
}

// Request user wallet for NFT
async function checkWalletAPI(_inputAddress, _assetID) {
  const UTXOs = await axios.get(
    `https://cardano-mainnet.blockfrost.io/api/v0/addresses/${_inputAddress}/utxos`,
    {
      headers: {
        project_id: "mainnetk2j4Ub9fcAKKDavAKmKHYxvE8QZEwYX6",
      },
    }
  );

  if (UTXOs.length === 0) {
    console.log("Keine results");
    return { status: 400, walletStatus: false };
  }

  for (let i = 0; i < UTXOs.data.length; i++) {
    if (UTXOs.data[i].amount.length > 1) {
      if (UTXOs.data[i].amount[1].unit === _assetID) {
        console.log("NFT is inside");
        return { status: 200, walletStatus: true };
      }
    }
    if (i + 1 === UTXOs.data.length && UTXOs.data[i].amount.length <= 1) {
      return { status: 200, walletStatus: false };
    }
  }
}

function toNumberString(num) {
  if (Number.isInteger(num)) {
    return num;
  } else {
    return num.toString();
  }
}

module.exports.checkWallet = checkWallet;

