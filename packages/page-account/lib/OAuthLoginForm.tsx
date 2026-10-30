import { type OAuthProvider } from "@keybr/pages-shared";
import { Button, Field, FieldList, Icon, Para } from "@keybr/widget";
import { mdiFacebook, mdiGoogle, mdiLogin, mdiMicrosoft } from "@mdi/js";
import { FormattedMessage, useIntl } from "react-intl";

const icons: Readonly<Record<string, string>> = {
  google: mdiGoogle,
  microsoft: mdiMicrosoft,
  facebook: mdiFacebook,
};

export function OAuthLoginForm({
  providers,
}: {
  providers: readonly OAuthProvider[];
}) {
  const { formatMessage } = useIntl();

  return (
    <>
      <FieldList>
        {providers.map(({ id, name }) => (
          <Field key={id}>
            <Button
              size={16}
              icon={<Icon shape={icons[id] ?? mdiLogin} />}
              label={formatMessage(
                {
                  id: "t_Signin_with_name",
                  defaultMessage: "Sign-in with {name}",
                },
                { name },
              )}
              onClick={() => {
                document.location = `/auth/oauth-init/${id}`;
              }}
            />
          </Field>
        ))}
      </FieldList>

      <Para>
        <FormattedMessage
          id="account.socialForm.description"
          defaultMessage="Sign-in with your preferred social network. We respect your privacy and promise to never spam your wall, friends, or e-mail."
        />
      </Para>
    </>
  );
}
