using UnityEngine;
using CrimeCity.Data;
using CrimeCity.Player;

namespace CrimeCity.Vehicles
{
    /// <summary>
    /// Drives a single spawned vehicle instance. Handling numbers (top
    /// speed, acceleration, handling) come straight from the vehicle's
    /// catalog entry, so a Compact and a HyperCar and a Submarine all use
    /// this same component with wildly different feel just from data.
    /// Boats/subs/aircraft reuse this with gravity/buoyancy tweaks noted
    /// below rather than separate controllers, to keep 1000+ catalog
    /// entries drivable without one-off code per vehicle.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class VehicleController : MonoBehaviour
    {
        [SerializeField] private string vehicleDefinitionId;
        [SerializeField] private Transform exitPoint;
        [SerializeField] private Transform[] wheels; // visual-only; no per-wheel physics here

        private Rigidbody _rb;
        private VehicleDefinition _def;
        private PlayerController _driver;

        public bool IsOccupied => _driver != null;
        public VehicleDefinition Definition => _def;

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
        }

        private void Start()
        {
            ResolveDefinition();
        }

        /// <summary>Called by spawners (dealerships, heist reward vehicles) right after Instantiate, before Start runs.</summary>
        public void SetVehicleDefinitionId(string id)
        {
            vehicleDefinitionId = id;
            ResolveDefinition();
        }

        private void ResolveDefinition()
        {
            if (string.IsNullOrEmpty(vehicleDefinitionId)) return;
            _def = CatalogService.Instance?.GetVehicle(vehicleDefinitionId);
            if (_def == null)
            {
                Debug.LogWarning($"[VehicleController] unknown vehicleDefinitionId '{vehicleDefinitionId}' on {name}");
            }
        }

        public void SetDriver(PlayerController driver)
        {
            _driver = driver;
            _rb.isKinematic = driver == null ? _rb.isKinematic : false;
        }

        public Vector3 GetExitPoint() =>
            exitPoint != null ? exitPoint.position : transform.position + transform.right * 2f;

        private void FixedUpdate()
        {
            if (_driver == null || _def == null) return;

            float throttle = Input.GetAxis("Vertical");
            float steer = Input.GetAxis("Horizontal");

            // topSpeedKmh -> m/s for the forward-force target speed.
            float topSpeedMs = _def.topSpeedKmh / 3.6f;
            float accelForce = Mathf.Lerp(2000f, 12000f, Mathf.InverseLerp(2f, 10f, _def.acceleration));
            float turnTorque = Mathf.Lerp(300f, 1200f, Mathf.InverseLerp(3f, 10f, _def.handling));

            if (_rb.velocity.magnitude < topSpeedMs)
            {
                _rb.AddForce(transform.forward * throttle * accelForce, ForceMode.Force);
            }
            _rb.AddTorque(Vector3.up * steer * turnTorque * Mathf.Sign(throttle == 0 ? 1 : throttle), ForceMode.Force);
        }
    }
}
