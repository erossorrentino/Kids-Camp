// Hand-written signature stubs of third-party SDK APIs (Google Mobile Ads v9,
// UMP, Unity IAP 4.8+, Unity Services Core, Unity Mobile Notifications 2.x).
// They only let the compile harness type-check the integration adapters; they
// are NOT the real SDKs.
using System;
using System.Threading.Tasks;

namespace GoogleMobileAds.Api
{
    public enum TagForChildDirectedTreatment { Unspecified = -1, False = 0, True = 1 }
    public class RequestConfiguration { public TagForChildDirectedTreatment? TagForChildDirectedTreatment; }
    public class InitializationStatus { }
    public static class MobileAds
    {
        public static bool RaiseAdEventsOnUnityMainThread { get; set; }
        public static void Initialize(Action<InitializationStatus> initCompleteAction) { }
        public static void SetRequestConfiguration(RequestConfiguration requestConfiguration) { }
    }
    public class AdRequest { }
    public class AdError { public string GetMessage() => null; }
    public class LoadAdError : AdError { }
    public class Reward { public string Type; public double Amount; }
    public class ServerSideVerificationOptions
    {
        public class Builder
        {
            public Builder SetUserId(string userId) => this;
            public Builder SetCustomData(string customData) => this;
            public ServerSideVerificationOptions Build() => new ServerSideVerificationOptions();
        }
    }
    public class RewardedAd
    {
        public static void Load(string adUnitId, AdRequest request, Action<RewardedAd, LoadAdError> adLoadCallback) { }
        public bool CanShowAd() => false;
        public void Show(Action<Reward> userRewardEarnedCallback) { }
        public void Destroy() { }
        public void SetServerSideVerificationOptions(ServerSideVerificationOptions options) { }
        public event Action OnAdFullScreenContentClosed;
        public event Action<AdError> OnAdFullScreenContentFailed;
        void Touch() { OnAdFullScreenContentClosed?.Invoke(); OnAdFullScreenContentFailed?.Invoke(null); }
    }
}

namespace GoogleMobileAds.Ump.Api
{
    public class FormError { public int ErrorCode; public string Message; }
    public class ConsentRequestParameters { public bool TagForUnderAgeOfConsent; }
    public static class ConsentInformation
    {
        public static void Update(ConsentRequestParameters request, Action<FormError> consentInfoUpdateCallback) { }
        public static bool CanRequestAds() => true;
    }
    public static class ConsentForm
    {
        public static void LoadAndShowConsentFormIfRequired(Action<FormError> onDismissed) { }
    }
}

namespace Unity.Services.Core
{
    public static class UnityServices { public static Task InitializeAsync() => Task.CompletedTask; }
}

namespace UnityEngine.Purchasing
{
    public enum ProductType { Consumable, NonConsumable, Subscription }
    public enum PurchaseProcessingResult { Complete, Pending }
    public enum InitializationFailureReason { PurchasingUnavailable, NoProductsAvailable, AppNotKnown }
    public enum PurchaseFailureReason { PurchasingUnavailable, ExistingPurchasePending, ProductUnavailable, SignatureInvalid, UserCancelled, PaymentDeclined, DuplicateTransaction, Unknown }
    public class ProductDefinition { public string id; }
    public class ProductMetadata { public string localizedPriceString; }
    public class Product { public ProductDefinition definition; public ProductMetadata metadata; public string transactionID; public string receipt; }
    public class ProductCollection { public Product WithID(string id) => null; }
    public class PurchaseEventArgs { public Product purchasedProduct; }
    public interface IStoreController
    {
        ProductCollection products { get; }
        void InitiatePurchase(string productId);
        void ConfirmPendingPurchase(Product product);
    }
    public interface IStoreExtension { }
    public interface IExtensionProvider { T GetExtension<T>() where T : IStoreExtension; }
    public interface IAppleExtensions : IStoreExtension { void RestoreTransactions(Action<bool, string> callback); }
    public interface IGooglePlayStoreExtensions : IStoreExtension { bool IsPurchasedProductDeferred(Product product); }
    public interface IStoreConfiguration { }
    public interface IGooglePlayConfiguration : IStoreConfiguration { void SetDeferredPurchaseListener(Action<Product> action); }
    public interface IStoreListener
    {
        void OnInitializeFailed(InitializationFailureReason error);
        void OnInitializeFailed(InitializationFailureReason error, string message);
        PurchaseProcessingResult ProcessPurchase(PurchaseEventArgs purchaseEvent);
        void OnPurchaseFailed(Product product, PurchaseFailureReason failureReason);
        void OnInitialized(IStoreController controller, IExtensionProvider extensions);
    }
    public interface IDetailedStoreListener : IStoreListener
    {
        void OnPurchaseFailed(Product product, Extension.PurchaseFailureDescription failureDescription);
    }
    public class StandardPurchasingModule { public static StandardPurchasingModule Instance() => null; }
    public class ConfigurationBuilder
    {
        public static ConfigurationBuilder Instance(StandardPurchasingModule module) => new ConfigurationBuilder();
        public ConfigurationBuilder AddProduct(string id, ProductType type) => this;
        public T Configure<T>() where T : IStoreConfiguration => default;
    }
    public static class UnityPurchasing { public static void Initialize(IDetailedStoreListener listener, ConfigurationBuilder builder) { } }
}

namespace UnityEngine.Purchasing.Extension
{
    public class PurchaseFailureDescription { public string productId; public PurchaseFailureReason reason; public string message; }
}

namespace Unity.Notifications.Android
{
    public enum Importance { None, Low, Default, High }
    public struct AndroidNotificationChannel
    {
        public AndroidNotificationChannel(string id, string name, string description, Importance importance) { }
    }
    public struct AndroidNotification { public string Title; public string Text; public DateTime FireTime; public string SmallIcon; }
    public static class AndroidNotificationCenter
    {
        public static void RegisterNotificationChannel(AndroidNotificationChannel channel) { }
        public static int SendNotification(AndroidNotification notification, string channelId) => 0;
        public static void CancelAllScheduledNotifications() { }
        public static void CancelAllDisplayedNotifications() { }
    }
}
