import { createRouter, RouterProvider } from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import "antd-mobile/es/global"
import "./index.css"
import { routeTree } from "./routeTree.gen"

const basepath =
  import.meta.env.BASE_URL === "/" ? "/" : import.meta.env.BASE_URL.replace(/\/$/, "")
const router = createRouter({ routeTree, basepath })
const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Root element #root was not found")
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

createRoot(rootElement).render(<RouterProvider router={router} />)
