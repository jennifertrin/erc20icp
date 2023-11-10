import { type Nft, TokenMetadataResponse } from 'alchemy-sdk';
import { useMetaMask } from 'metamask-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaCircleNotch,
  FaEthereum,
  FaSignOutAlt,
  FaTimesCircle,
} from 'react-icons/fa';
import { styled } from 'styled-components';
import tw from 'twin.macro';
import { useSessionStorage } from '../hooks/utils/useLocalStorage';
import { useAddressVerified } from '../services/addressService';
import { getAlchemy } from '../services/alchemyService';
import { getBackend } from '../services/backendService';
import { refreshHistory, usePublicNfts } from '../services/historyService';
import useIdentity, { logout } from '../services/userService';
import { handleError, handlePromise } from '../utils/handlers';
import { LoginAreaButton } from './LoginArea';
import NftList from './NftList';

const FormContainer = styled.form`
  input[type='text'],
  input[type='number'],
  textarea {
    ${tw`w-full border-2 p-2 rounded-lg`}
  }
`;

export const WalletAreaButton = tw.div`flex items-center gap-2 px-4 py-2 border-2 text-lg rounded-full cursor-pointer select-none bg-[#fff8] hover:bg-gray-100`;

export default function WalletArea() {
  const user = useIdentity();
  const { status, connect, account, ethereum } = useMetaMask();
  const [nftUrl, setNftUrl] = useSessionStorage('ic-eth.nft-url', '');
  const [tokenResult, setTokenResult] = useState<{
    nft?: Nft;
    token?: TokenMetadataResponse;
    err?: string;
  }>({});
  const [isNftValid, setNftValid] = useState<boolean>();

  const address = (ethereum?.selectedAddress as string | undefined) || '';
  const [isAddressVerified, verifyAddress] = useAddressVerified(
    address,
    ethereum,
  );

  const principalString = user?.client.getIdentity().getPrincipal().toString();
  const nfts = usePublicNfts();
  const ownedNfts =
    nfts?.filter(
      (nft) => nft.principal === principalString || nft.wallet === address,
    ) || [];

  const parseOpenSeaNft = (nftUrl: string) => {
    const groups =
      /^https:\/\/(testnets\.)?opensea\.io\/assets\/(\w+)\/(\w+)\/(\d+)/.exec(
        nftUrl,
      );
    if (!groups) {
      return;
    }
    const [, isTestnets, network, contract, tokenId] = groups;
    return {
      network: isTestnets ? network : 'mainnet',
      contract,
      tokenId: Number(tokenId),
    };
  };

  const parseEtherscanNft = (nftUrl: string) => {
    const groups = /^https:\/\/(\w+)\.etherscan\.io\/nft\/(\w+)\/(\d+)/.exec(
      nftUrl,
    );
    if (!groups) {
      return;
    }
    const [, network, contract, tokenId] = groups;
    return {
      network: network || 'mainnet',
      contract,
      tokenId: Number(tokenId),
    };
  };

  const parseEtherscanToken = (nftUrl: string) => {
    const groups =
      /^https:\/\/(\w+)\.etherscan\.io\/token\/(\w+)(?:\/(\d+))?/.exec(nftUrl);
    if (!groups) {
      return;
    }
    const [, network, contract, tokenId] = groups;
    return {
      network: network || 'mainnet',
      contract,
      tokenId: tokenId ? Number(tokenId) : null,
    };
  };

  const tokenInfo = useMemo(
    () =>
      parseOpenSeaNft(nftUrl) ||
      parseEtherscanNft(nftUrl) ||
      parseEtherscanToken(nftUrl),
    [nftUrl],
  );

  const isCollectionUrl =
    !tokenInfo &&
    (/^https:\/\/(testnets\.)?opensea\.io\/assets\/(\w+)\/(\w+)/.test(nftUrl) ||
      /^https:\/\/(?:(\w+)\.)?etherscan\.io\/nft\/(\w+)/.test(nftUrl) ||
      /^https:\/\/(?:(\w+)\.)?etherscan\.io\/token\/(\w+)/.test(nftUrl));

  const verifyToken = useCallback(() => {
    setNftValid(undefined);
    if (isAddressVerified && tokenInfo) {
      handlePromise(
        (async () => {
          try {
            let nft;

            if (tokenInfo.tokenId) {
              nft = await getAlchemy(
                `eth-${tokenInfo.network}` as any,
              ).nft.getNftMetadata(tokenInfo.contract, tokenInfo.tokenId, {});
              setTokenResult({ nft });
            }

            let token;
            if (
              nft?.tokenType === 'NO_SUPPORTED_NFT_STANDARD' ||
              nft?.tokenType === 'UNKNOWN'
            ) {
              token = await getAlchemy(
                `eth-${tokenInfo.network}` as any,
              ).core.getTokenMetadata(tokenInfo.contract);
              setTokenResult({ token });
            }

            try {
              const tokenType =
                nft?.tokenType === 'ERC1155'
                  ? { erc1155: null }
                  : nft?.tokenType === 'ERC721'
                  ? { erc721: null }
                  : token?.name !== null
                  ? { erc20: null }
                  : undefined;
              if (!tokenType) {
                throw new Error(`Unknown token type: ${nft?.tokenType}`);
              }
              const valid = await getBackend().addNfts([
                {
                  contract: tokenInfo.contract,
                  network: tokenInfo.network,
                  tokenType: tokenType,
                  tokenId: tokenInfo.tokenId ? [BigInt(tokenInfo.tokenId)] : [],
                  owner: address,
                },
              ]);
              setNftValid(valid);
              if (valid) {
                refreshHistory();
              }
            } catch (err) {
              handleError(err, 'Error while verifying NFT ownership!');
              setNftValid(false);
            }
          } catch (err) {
            console.warn(err);
            setTokenResult({ err: String(err) });
          }
        })(),
      );
    }
  }, [address, isAddressVerified, tokenInfo]);

  useEffect(() => verifyToken(), [verifyToken]);

  const getMetaMaskButton = () => {
    if (status === 'notConnected') {
      return (
        <WalletAreaButton onClick={connect}>
          <FaEthereum />
          Connect to MetaMask
        </WalletAreaButton>
      );
    }
    if (status === 'initializing') {
      return <div tw="opacity-60">Initializing...</div>;
    }
    if (status === 'connecting') {
      return <div tw="opacity-60">Connecting...</div>;
    }
    if (status === 'connected') {
      return (
        <div tw="flex flex-col md:flex-row items-start md:items-center gap-2">
          <div tw="flex-1 text-xl text-gray-600">
            <div tw="flex items-center gap-2">
              {/* <FaEthereum tw="hidden sm:block text-3xl" /> */}
              <div>
                Ethereum address:
                <div tw="text-xs sm:text-sm font-bold mt-1">{account}</div>
              </div>
            </div>
          </div>
          {isAddressVerified === false && (
            <div tw="flex flex-col items-center mt-3 sm:mt-0">
              <LoginAreaButton
                tw="flex gap-1 items-center text-base px-4 text-blue-600 border-blue-500"
                onClick={() => verifyAddress()}
              >
                <FaEthereum />
                <span tw="font-semibold select-none ml-1 animate-pulse [animation-duration: 2s]">
                  Verify wallet
                </span>
              </LoginAreaButton>
            </div>
          )}
        </div>
      );
    }
    return (
      <div>
        <a
          tw="text-blue-500"
          href="https://metamask.io/"
          target="_blank"
          rel="noreferrer"
        >
          MetaMask is required for this Dapp
        </a>
      </div>
    );
  };

  return (
    <>
      {!!user && (
        <>
          <div tw="flex flex-col md:flex-row items-start md:items-center gap-2">
            <div tw="flex-1 text-xl text-gray-600">
              Internet Computer principal:
              <div tw="text-xs sm:text-sm font-bold mt-1">
                {user.client.getIdentity().getPrincipal().toString()}
              </div>
            </div>
            <div tw="flex flex-col items-center mt-3 sm:mt-0">
              <LoginAreaButton
                tw="flex gap-1 items-center text-base px-4"
                onClick={() =>
                  handlePromise(logout(), undefined, 'Error while signing out!')
                }
              >
                <FaSignOutAlt />
                <span tw="font-semibold select-none ml-1">Sign out</span>
              </LoginAreaButton>
            </div>
          </div>
          <hr tw="my-5" />
        </>
      )}
      <div tw="mx-auto">{getMetaMaskButton()}</div>
      {!!isAddressVerified && (
        <>
          <hr tw="my-5" />
          <FormContainer>
            <label>
              <div tw="flex items-center gap-3 text-xl text-gray-600 mb-1">
                <div>OpenSea or Etherscan URL:</div>
                {!!tokenInfo && (
                  <div tw="text-base">
                    {isNftValid === true ? (
                      <FaCheckCircle tw="text-green-500" />
                    ) : isNftValid === false ? (
                      <FaTimesCircle
                        tw="text-red-500 cursor-pointer"
                        onClick={() => verifyToken()}
                      />
                    ) : (
                      <FaCircleNotch tw="opacity-60 animate-spin [animation-duration: 2s]" />
                    )}
                  </div>
                )}
              </div>
              <input
                css={
                  tokenInfo && [
                    isNftValid === true
                      ? tw`border-green-500`
                      : isNftValid === false
                      ? tw`border-red-500`
                      : tw`border-yellow-500`,
                  ]
                }
                type="text"
                placeholder="Paste NFT URL here"
                value={nftUrl}
                onChange={(e) => setNftUrl(e.target.value)}
              />
            </label>
            {!!isCollectionUrl && (
              <div tw="text-red-600 font-bold">
                Please enter a valid token URL
              </div>
            )}
            {tokenInfo && tokenResult ? (
              <>
                {'nft' in tokenResult && (
                  <div tw="mt-3 max-w-[500px] mx-auto">
                    <TokenView
                      nft={tokenResult.nft as Nft}
                      token={tokenResult.token as TokenMetadataResponse}
                    />
                  </div>
                )}
                {'err' in tokenResult && (
                  <div tw="text-red-600 font-bold">{tokenResult.err}</div>
                )}
              </>
            ) : (
              <a
                tw="text-blue-500"
                href="https://testnets.opensea.io/account"
                target="_blank"
                rel="noreferrer"
              >
                OpenSea account page
              </a>
            )}
          </FormContainer>
          {!!nfts && (
            <>
              <hr tw="my-5" />
              <div tw="text-xl text-gray-600 mb-3">Previously verified:</div>
              <NftList items={ownedNfts} />
            </>
          )}
        </>
      )}
    </>
  );
}

function TokenView({ nft, token }: { nft: Nft; token: TokenMetadataResponse }) {
  return (
    <div tw="p-5 sm:p-6 bg-white rounded-xl space-y-3 drop-shadow-2xl">
      {!!nft?.title ||
        (!!token?.name && (
          <div tw="text-2xl sm:text-3xl font-bold">
            {nft?.title || token?.name}
          </div>
        ))}
      {!!nft.media.length ? (
        <img
          tw="w-full rounded-xl"
          alt="NFT preview"
          src={nft.media[0].gateway}
        />
      ) : null}
      {!!nft?.description || !!token?.symbol ? (
        <div tw="sm:text-xl">{nft?.description || token?.symbol}</div>
      ) : null}
    </div>
  );
}
