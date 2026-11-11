import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type Me } from "../api";
import { MeContext } from "../App";
import { ErrorBoundary } from "../ErrorBoundary";
import { CampaignEditor } from "../pages/CampaignForm";

const me: Me = {
  name: "Olivia Owner",
  email: "owner@acme.test",
  role: "OWNER",
  timeZone: "America/New_York",
  tenant: "Acme",
  brands: [
    { id: "b-us", name: "Acme US", currency: "USD" },
    { id: "b-jp", name: "Acme Japan", currency: "JPY" },
  ],
};

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MeContext.Provider value={me}>
        <MemoryRouter>
          <CampaignEditor />
        </MemoryRouter>
      </MeContext.Provider>
    </QueryClientProvider>,
  );
}

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

describe("campaign editor", () => {
  it("flags invalid fields accessibly before any request is sent", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(screen.getByRole("textbox", { name: /Name/ }).getAttribute("aria-invalid")).toBe("true");
    const brands = screen.getByRole("group", { name: "Brands" });
    expect(within(brands).getByRole("checkbox", { name: /Acme US/ }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByRole("alert").some((a) => /at least one brand/i.test(a.textContent ?? ""))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses brands in different currencies", async () => {
    globalThis.fetch = vi.fn() as typeof fetch;
    renderEditor();
    const brands = screen.getByRole("group", { name: "Brands" });
    await userEvent.click(within(brands).getByRole("checkbox", { name: /Acme US/ }));
    await userEvent.click(within(brands).getByRole("checkbox", { name: /Acme Japan/ }));
    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
    expect(screen.getByText(/different currencies \(USD, JPY\)/)).toBeTruthy();
  });

  it("keeps each prize's amount with its row when an earlier row is removed", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Add place" }));
    await userEvent.click(screen.getByRole("button", { name: "Add place" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Place 1 amount/ }), "100");
    await userEvent.type(screen.getByRole("textbox", { name: /Place 2 amount/ }), "50");
    await userEvent.type(screen.getByRole("textbox", { name: /Place 3 amount/ }), "25");

    await userEvent.click(screen.getByRole("button", { name: "Remove prize 1" }));

    // With index keys, the inputs would shift and show 100/50 in the wrong places.
    expect((screen.getByRole("textbox", { name: /Place 1 amount/ }) as HTMLInputElement).value).toBe("50");
    expect((screen.getByRole("textbox", { name: /Place 2 amount/ }) as HTMLInputElement).value).toBe("25");
    expect(screen.queryByRole("textbox", { name: /Place 3 amount/ })).toBeNull();
  });
});

describe("api client", () => {
  it("reads field errors and the request id from the API's error envelope", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json(
        { error: "validation", message: "Some fields need attention", details: [{ path: "name", message: "Name is too short" }], requestId: "r-9" },
        { status: 400 },
      ),
    ) as typeof fetch;
    const err = await api.campaign("c1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: "validation", requestId: "r-9", message: "Some fields need attention" });
    expect((err as ApiError).fields).toEqual([{ path: "name", message: "Name is too short" }]);
  });

  it("ignores details that aren't field errors", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ error: "conflict", message: "Reload", details: { version: 3 } }, { status: 409 })) as typeof fetch;
    const err = (await api.campaign("c1").catch((e: unknown) => e)) as ApiError;
    expect(err.fields).toEqual([]);
    expect(err.message).toBe("Reload");
  });
});

describe("error boundary", () => {
  it("shows what failed and offers a retry instead of a blank page", () => {
    const Boom = () => {
      throw new Error("bad data");
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary area="page">
        <Boom />
      </ErrorBoundary>,
    );
    quiet.mockRestore();
    expect(screen.getByRole("alert").textContent).toContain("The page failed to render: bad data");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
