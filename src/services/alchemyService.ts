import { Alchemy, Network, Nft, TokenMetadataResponse } from 'alchemy-sdk';
import { AlchemyProvider } from 'ethers';
import { useCallback } from 'react';
import useRefresh, { Refresh } from '../hooks/utils/useRefresh';

const apiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!apiKey) {
  console.warn('Alchemy API key not found!');
}

export function getAlchemyProvider(network: string) {
  return new AlchemyProvider(network, apiKey);
}

export function getAlchemy(network: Network): Alchemy {
  const alchemy = new Alchemy({
    apiKey,
    network,
  });
  return alchemy;
}

export function useNftMetadata(
  network: string,
  contract: string,
  tokenId: number | string | bigint,
): Refresh<Nft | null | undefined> {
  const refresh = useCallback(
    () =>
      getAlchemy(`eth-${network}` as any)
        .nft.getNftMetadata(contract, tokenId, {})
        .catch((err) => {
          console.error(err);
          return null;
        }),
    [contract, network, tokenId],
  );
  return useRefresh(refresh);
}

export function useTokenMetadata(
  network: string,
  contract: string,
): Refresh<TokenMetadataResponse | null | undefined> {
  const refresh = useCallback(
    () =>
      getAlchemy(`eth-${network}` as any)
        .core.getTokenMetadata(contract)
        .catch((err) => {
          console.error(err);
          return null;
        }),
    [contract, network],
  );
  return useRefresh(refresh);
}
