import { expect, test } from '../../../fixtures/admin-fixtures';
import { getUserSmpp } from '../../../utils/admin-api';
import { blockWrites } from '../../../utils/write-guard';

// Read-only: opens Users > Create User and a user's edit page and never saves. The form schema
// (GET users/form/input) marks every SMPP field disabled on create, so only ticking Enable SMPP
// should unlock them. Titles carry the INF-14706 test plan's IDs.

test.describe('Create User SMPP Configuration', () => {
  test('ADM-01 offers Enable SMPP unticked on Create User', async ({ createUserPage }) => {
    await createUserPage.open();

    await createUserPage.form.expectSmppEnabled(false);
  });

  // The newest qa_auto_ user, whichever way its SMPP is set: the box must show what is stored.
  test('ADM-01 shows Enable SMPP on the edit page as the user has it', async ({
    adminApi,
    usersPage,
    editUserPage,
  }) => {
    await usersPage.open();
    const [user] = await usersPage.search('qa_auto_');
    test.skip(!user, 'No qa_auto_ user to open.');

    await usersPage.openEdit(user.username);
    await editUserPage.expectOpened(user.username);

    const { is_smpp_enabled } = await getUserSmpp(adminApi, user.id);
    await editUserPage.form.expectSmppEnabled(is_smpp_enabled === 1);
    expect(editUserPage.userId()).toBe(user.id);
  });

  test('ADM-02 keeps the SMPP fields locked until Enable SMPP is ticked', async ({ createUserPage }) => {
    await createUserPage.open();

    await createUserPage.form.expectSmppEnabled(false);
    await createUserPage.form.expectSmppFieldsEditable(false);
  });

  test('ADM-02 unlocks the SMPP fields when Enable SMPP is ticked', async ({ createUserPage }) => {
    await createUserPage.open();

    await createUserPage.form.tickEnableSmpp();

    await createUserPage.form.expectSmppFieldsEditable(true);
  });

  // INF-14744: unticking keeps the typed values on screen, but Save must leave them out and send
  // is_smpp_enabled as a boolean. Only the SMPP fields are filled, so a request that got past the
  // block would be refused. Relies on Save posting an incomplete form, as staging does today.
  test('ADM-02 sends no SMPP values when Enable SMPP is unticked before Save', async ({ page, createUserPage }) => {
    const blocked = await blockWrites(page);
    await createUserPage.open();
    await createUserPage.form.enterSmpp({
      username: 'qaunticked',
      shortcode: '56789',
      allowedIps: '192.0.2.10',
      maxTransmitterSessions: 3,
      maxReceiverSessions: 2,
      maxTransceiverSessions: 4,
    });
    await createUserPage.form.untickEnableSmpp();

    await createUserPage.clickSave();

    await expect.poll(() => blocked.length, { message: 'requests Save sent' }).toBe(1);
    expect(blocked[0]).toMatchObject({ method: 'POST', path: expect.stringMatching(/\/api\/v1\/users$/) });
    const smppSent = Object.entries(blocked[0].body as Record<string, unknown>).filter(([key]) => key.includes('smpp'));
    expect(Object.fromEntries(smppSent)).toEqual({ is_smpp_enabled: false });
  });
});
