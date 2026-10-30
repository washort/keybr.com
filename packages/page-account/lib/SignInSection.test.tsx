import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import {
  type LoginMethods,
  type PageData,
  PageDataContext,
} from "@keybr/pages-shared";
import { render } from "@testing-library/react";
import { isNotNull, isNull } from "rich-assert";
import { type SignInActions } from "./actions.ts";
import { SignInSection } from "./SignInSection.tsx";

function renderSection(loginMethods: LoginMethods) {
  return render(
    <PageDataContext.Provider value={{ loginMethods } as PageData}>
      <FakeIntlProvider>
        <SignInSection actions={{} as SignInActions} />
      </FakeIntlProvider>
    </PageDataContext.Provider>,
  );
}

test("render social and e-mail login", () => {
  const r = renderSection({
    email: true,
    oauth: [
      { id: "google", name: "Google" },
      { id: "microsoft", name: "Microsoft" },
      { id: "facebook", name: "Facebook" },
    ],
  });

  isNotNull(
    r.queryByText("Simple sign-in that does not use passwords.", {
      exact: false,
    }),
  );
  isNotNull(
    r.queryByText("Sign-in with your preferred social network.", {
      exact: false,
    }),
  );
  isNotNull(r.queryByText("Google", { exact: false }));
  isNotNull(r.queryByText("Microsoft", { exact: false }));
  isNotNull(r.queryByText("Facebook", { exact: false }));
  isNotNull(r.queryByText("Sign-in with e-mail", { exact: false }));

  r.unmount();
});

test("render only the configured OIDC provider", () => {
  const r = renderSection({
    email: false,
    oauth: [{ id: "authelia", name: "Greyface SSO" }],
  });

  isNotNull(r.queryByText("Greyface SSO", { exact: false }));
  isNull(r.queryByText("Google", { exact: false }));
  isNull(r.queryByText("Microsoft", { exact: false }));
  isNull(r.queryByText("Facebook", { exact: false }));
  isNull(r.queryByText("Sign-in with e-mail", { exact: false }));

  r.unmount();
});

test("render neither section when nothing is enabled", () => {
  const r = renderSection({ email: false, oauth: [] });

  isNull(
    r.queryByText("Sign-in with your preferred social network.", {
      exact: false,
    }),
  );
  isNull(r.queryByText("Sign-in with e-mail", { exact: false }));

  r.unmount();
});
