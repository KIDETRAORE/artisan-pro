import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";

/* ============================
   TYPES
============================ */

export type Quota = {
  used: number;
  limit: number;
};

export type UserData = {
  plan?: string;
  quota?: Quota;
};

type UserContextType = {
  userData: UserData | null;
  setUserData: (data: UserData | null) => void;
  clearUserData: () => void;
};

/* ============================
   CONTEXT
============================ */

const UserContext = createContext<UserContextType | undefined>(
  undefined
);

/* ============================
   PROVIDER
============================ */

export function UserProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [userData, setUserData] =
    useState<UserData | null>(null);

  const clearUserData = () => {
    setUserData(null);
  };

  return (
    <UserContext.Provider
      value={{
        userData,
        setUserData,
        clearUserData,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

/* ============================
   HOOK
============================ */

export function useUser() {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error(
      "useUser must be used inside UserProvider"
    );
  }

  return context;
}
