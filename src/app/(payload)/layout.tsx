/* THIS FILE WAS GENERATED FROM PAYLOAD'S TEMPLATE AND IS OWNED BY PAYLOAD.
   It wires the admin panel into the App Router and is deliberately thin.

   Note the route group: (payload) sits outside (site), so the admin inherits
   none of the storefront's chrome, fonts or global styles — and the storefront
   inherits none of the admin's. They are two applications sharing a process.

   Stage 22.5: the panel is mounted at /cms (routes.admin); /admin is Reality 3D
   Admin in the (admin) route group. */
import type { ServerFunctionClient } from "payload";

import config from "@payload-config";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import { importMap } from "./cms/importMap";

import "@payloadcms/next/css";
/* Stage 22.5: Reality 3D theme variables for Advanced CMS. After Payload's CSS. */
import "./custom.css";

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
