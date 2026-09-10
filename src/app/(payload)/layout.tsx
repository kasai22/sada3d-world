/* THIS FILE WAS GENERATED FROM PAYLOAD'S TEMPLATE AND IS OWNED BY PAYLOAD.
   It wires the admin panel into the App Router and is deliberately thin.

   Note the route group: (payload) sits outside (site), so the admin inherits
   none of the storefront's chrome, fonts or global styles — and the storefront
   inherits none of the admin's. They are two applications sharing a process. */
import type { ServerFunctionClient } from "payload";

import config from "@payload-config";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import { importMap } from "./admin/importMap";

import "@payloadcms/next/css";

type Args = {
  children: React.ReactNode;
};

const serverFunction: ServerFunctionClient = async function (args) {
  "use server";
  return handleServerFunctions({ ...args, config, importMap });
};

export default function Layout({ children }: Args) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  );
}
