import Types "Types";
import State "State";
import History "History";
import Snapshot "Snapshot";
import Principal "mo:base/Principal";
import Nat64 "mo:base/Nat64";
import Error "mo:base/Error";
import System "lib/System";
import Iter "lib/IterMore";
import IcEth "canister:ic_eth";
import Seq "mo:sequence/Sequence";
import Stream "mo:sequence/Stream";

module {
  public class Core(installer : Principal, sys : System.System, _state : State.Stable.State, history : History.History) {

    let state = State.OOOf(sys, _state);
    public let logger = History.Logger(sys, history);

    func unreachable() : None {
      do { assert false; loop {} };
    };

    public func login(caller : Principal) : Types.Resp.Login {
      let log = logger.Begin(caller, #login);
      log.okWith(state.login(caller));
    };

    public func fastLogin(caller : Principal) : ?Types.Resp.Login {
      switch (state.principals.get(caller)) {
        case null null;
        case (?_) ?login(caller);
      };
    };

    public func getEthWallets(caller : Principal) : Types.Resp.GetEthWallets {
      state.getWalletsForPrincipal(caller);
    };

    public func connectEthWallet(caller : Principal, wallet : Types.EthWallet, signedPrincipal : Types.SignedPrincipal) : async Types.Resp.ConnectEthWallet {
      let log = logger.Begin(caller, #connectEthWallet(wallet, signedPrincipal));
      let checkOutcome = await IcEth.verify_ecdsa(wallet, Principal.toText caller, signedPrincipal);
      log.internal(#verifyEcdsaOutcome(checkOutcome));
      if (checkOutcome) {
        ignore (state.putWalletSignsPrincipal(wallet, caller, signedPrincipal));
      };
      log.okWith(checkOutcome);
    };

    public func isTokenOwned(caller : Principal, principal : Principal, nft : Types.Token.Token) : async Bool {
      let log = logger.Begin(caller, #isTokenOwned(nft));
      let isOwned = await isTokenOwned_(principal, nft);
      log.okWith(isOwned);
    };

    func isTokenOwned_(principal : Principal, nft : Types.Token.Token) : async Bool {
      switch (state.hasWalletSignsPrincipal(nft.owner, principal)) {
        case (?_) {
          switch (nft.tokenType) {
            case (#erc721) {
              switch (nft.tokenId) {
                 case (?tokenId) {
                   let owner = await IcEth.erc721_owner_of(nft.network, nft.contract, Nat64.fromNat(tokenId));
                   return owner == nft.owner;
                 };
                 case (null) {
                   throw Error.reject("tokenId is required for erc721");
                 };
              };
            };
            case (#erc1155) {
              switch (nft.tokenId) {
                 case (?tokenId) {
                   let balance = await IcEth.erc1155_balance_of(nft.network, nft.contract, nft.owner, Nat64.fromNat(tokenId));
                   balance > 0;
                 };
                 case (null) {
                   throw Error.reject("tokenId is required for erc721");
                 };
              };
            };
            case (#erc20) {
              let balance = await IcEth.erc20_balance_of(nft.network, nft.contract, nft.owner);
              balance > 0;
            };
          };
        };
        case null {
          false;
        };
      };
    };

    public func addTokens(caller : Principal, nfts : [Types.Token.Token]) : async Bool {
      let log = logger.Begin(caller, #addNfts(nfts));
      for (nft in nfts.vals()) {
        let isOwned = await isTokenOwned_(caller, nft);
        log.internal(#verifyOwnerOutcome(nft, isOwned));
        state.ethNfts.put(nft, nft);
        if (not isOwned) {
          return log.errWith(false);
        };
        if (state.walletOwnsNft.get(nft.owner, nft) == null) {
          state.emitAddNftEvent(caller, nft.owner, nft);
        };
        state.walletOwnsNft.put(nft.owner, nft, { checkTime = sys.time() });
      };
      log.okWith(true);
    };

    public func getNfts(caller : Principal) : [Types.Token.Token] {
      let nfts = Iter.filterMap<Types.PublicEvent, Types.Token.Token>(
        state.getPublicHistory(),
        func(e : Types.PublicEvent) : ?Types.Token.Token {
          switch (e) {
            case (#addNft(e)) {
              if (e.principal == caller) ?e.nft else null;
            };
            case _ null;
          };
        },
      );
      Iter.toArray(nfts);
    };

    public func setAddressFiltered(caller : Principal, address : Types.Address.Address, filtered : Bool) : async Bool {
      assert caller == installer;
      let log = logger.Begin(caller, #setAddressFiltered(address, filtered));
      if (filtered) {
        state.filteredAddresses.put(address);
      } else {
        state.filteredAddresses.remove(address);
      };
      log.okWith(true);
    };

    public func getPublicHistory(caller : Principal) : [Types.PublicEvent] {
      Iter.toArray(state.getPublicHistory());
    };

    public func getHistory(caller : Principal) : ?[History.Event] {
      assert caller == installer;
      do ? {
        logger.getEvents(0, logger.getSize());
      };
    };

    public func getState(caller : Principal) : ?[Snapshot.Entry] {
      assert caller == installer;
      do ? {
        Snapshot.getAll(_state);
      };
    };

  };
};
