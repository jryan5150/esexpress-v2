import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BOLDisplay } from "./BOLDisplay";

describe("BOLDisplay", () => {
  it("renders the ticket # as primary when only ticket is present", () => {
    render(<BOLDisplay ticketNo="1119603" />);
    expect(screen.getByText("1119603")).toBeInTheDocument();
  });

  it("renders the system BOL as fallback when only bolNo is present", () => {
    render(<BOLDisplay ticketNo={null} bolNo="AU2604172552098" />);
    expect(screen.getByText("AU2604172552098")).toBeInTheDocument();
  });

  it("renders ticket # as primary with system ID as muted suffix when both differ", () => {
    render(<BOLDisplay ticketNo="1119603" bolNo="AU2604172552098" />);
    expect(screen.getByText("1119603")).toBeInTheDocument();
    expect(screen.getByText(/· #AU2604172552098/)).toBeInTheDocument();
  });

  it("hides the suffix when ticket and bolNo match (same value)", () => {
    render(<BOLDisplay ticketNo="1119603" bolNo="1119603" />);
    expect(screen.getByText("1119603")).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("renders source prefix when showSourcePrefix is true and loadSource provided", () => {
    render(
      <BOLDisplay
        ticketNo="1119603"
        bolNo="AU123"
        loadSource="logistiq"
        showSourcePrefix
      />,
    );
    expect(screen.getByText("Logistiq BOL")).toBeInTheDocument();
  });

  it("omits source prefix when showSourcePrefix is false", () => {
    render(
      <BOLDisplay
        ticketNo="1119603"
        loadSource="propx"
        showSourcePrefix={false}
      />,
    );
    expect(screen.queryByText(/BOL$/i)).not.toBeInTheDocument();
  });

  it("renders '--' when neither ticket nor bolNo is provided", () => {
    render(<BOLDisplay ticketNo={null} bolNo={null} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("treats empty-string ticket/bol as absent", () => {
    render(<BOLDisplay ticketNo="   " bolNo="" />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("composes a descriptive title attribute including system ID when both differ", () => {
    render(
      <BOLDisplay
        ticketNo="1119603"
        bolNo="AU2604172552098"
        loadSource="logistiq"
      />,
    );
    const title = document.querySelector(
      "[title='Logistiq BOL #1119603 (system ID: AU2604172552098)']",
    );
    expect(title).toBeInTheDocument();
  });

  it("invokes onClick when clicked and renders as a button", () => {
    const handler = vi.fn();
    render(<BOLDisplay ticketNo="1119603" onClick={handler} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
