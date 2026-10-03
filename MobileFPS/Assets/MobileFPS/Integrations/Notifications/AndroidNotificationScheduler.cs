using System;
using MobileFPS.LiveOps;
using Unity.Notifications.Android;
using UnityEngine;

namespace MobileFPS.Integrations.Notifications
{
    /// <summary>
    /// Local notifications via Unity Mobile Notifications (com.unity.mobile.notifications 2.x).
    /// Compiles only when the package is installed; registers itself with
    /// <see cref="NotificationSchedulerRegistry"/>.
    ///
    /// Android 13+ requires the POST_NOTIFICATIONS runtime permission. Ask in
    /// context (after the first daily reward claim: "Want a reminder when
    /// tomorrow's reward is ready?"), not on first launch. Contextual asks get
    /// much higher opt-in.
    /// </summary>
    public sealed class AndroidNotificationScheduler : INotificationScheduler
    {
        private const string ChannelId = "mobilefps_rewards";
        private const string PostNotificationsPermission = "android.permission.POST_NOTIFICATIONS";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterAssembliesLoaded)]
        private static void Register()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            NotificationSchedulerRegistry.Factory = () => new AndroidNotificationScheduler();
#endif
        }

        public AndroidNotificationScheduler()
        {
            AndroidNotificationCenter.RegisterNotificationChannel(new AndroidNotificationChannel(
                ChannelId, "Rewards & Events", "Daily rewards, streak reminders and season events.", Importance.Default));
        }

        public bool IsAvailable => true;

        public void RequestPermission()
        {
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(PostNotificationsPermission))
            {
                UnityEngine.Android.Permission.RequestUserPermission(PostNotificationsPermission);
            }
        }

        public void CancelAll()
        {
            AndroidNotificationCenter.CancelAllScheduledNotifications();
            AndroidNotificationCenter.CancelAllDisplayedNotifications();
        }

        public void Schedule(string id, string title, string body, DateTime fireUtc)
        {
            var notification = new AndroidNotification
            {
                Title = title,
                Text = body,
                FireTime = fireUtc.ToLocalTime(), // the package interprets FireTime as device-local time
            };
            AndroidNotificationCenter.SendNotification(notification, ChannelId);
        }
    }
}
