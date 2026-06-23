using Microsoft.Identity.Client;

namespace AutoPilot.Service
{
    public class GraphAuthService
    {

        private readonly IPublicClientApplication _app;

        public GraphAuthService()
        {
            _app = PublicClientApplicationBuilder
                .Create("")
                .WithTenantId("")
                .Build();
        }


        private readonly string[] _scopes =
        {
                "User.Read",
                "Mail.Read",
                "Mail.Send"
        };


        public async Task<string> GetAccessTokenAsync()
        {

            var accounts = await _app.GetAccountsAsync();

            try
            { 
                var result = await _app.AcquireTokenSilent(_scopes, accounts.FirstOrDefault())
                                       .ExecuteAsync();

                return result.AccessToken;
            }
            catch (MsalUiRequiredException)
            {
                var result = await _app.AcquireTokenWithDeviceCode(
                    _scopes,
                    deviceCodeResult =>
                    {
                        Console.WriteLine(deviceCodeResult.Message);
                        return Task.CompletedTask;
                    }).ExecuteAsync();

                return result.AccessToken;
            }
        }
    }
}
