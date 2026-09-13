using UnityEngine;
using CrimeCity.Vehicles;

namespace CrimeCity.Player
{
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        [SerializeField] private float walkSpeed = 4.5f;
        [SerializeField] private float sprintSpeed = 8f;
        [SerializeField] private float jumpHeight = 1.2f;
        [SerializeField] private float gravity = -18f;
        [SerializeField] private float turnSpeed = 720f;
        [SerializeField] private float vehicleInteractRange = 4f;

        private CharacterController _controller;
        private Vector3 _verticalVelocity;
        private VehicleController _currentVehicle;

        public bool InVehicle => _currentVehicle != null;

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
        }

        private void Update()
        {
            if (InVehicle)
            {
                HandleVehicleExitInput();
                return; // driving input is handled by VehicleController while occupied
            }

            HandleMoveInput();
            HandleVehicleEnterInput();
        }

        private void HandleMoveInput()
        {
            float h = Input.GetAxisRaw("Horizontal");
            float v = Input.GetAxisRaw("Vertical");
            Vector3 inputDir = new Vector3(h, 0f, v);
            if (inputDir.sqrMagnitude > 1f) inputDir.Normalize();

            Vector3 camForward = Camera.main != null ? Camera.main.transform.forward : Vector3.forward;
            Vector3 camRight = Camera.main != null ? Camera.main.transform.right : Vector3.right;
            camForward.y = 0f; camRight.y = 0f;
            camForward.Normalize(); camRight.Normalize();

            Vector3 moveDir = camForward * inputDir.z + camRight * inputDir.x;
            float speed = Input.GetKey(KeyCode.LeftShift) ? sprintSpeed : walkSpeed;

            if (moveDir.sqrMagnitude > 0.001f)
            {
                Quaternion targetRot = Quaternion.LookRotation(moveDir);
                transform.rotation = Quaternion.RotateTowards(transform.rotation, targetRot, turnSpeed * Time.deltaTime);
            }

            if (_controller.isGrounded)
            {
                _verticalVelocity.y = -1f;
                if (Input.GetButtonDown("Jump"))
                {
                    _verticalVelocity.y = Mathf.Sqrt(jumpHeight * -2f * gravity);
                }
            }
            _verticalVelocity.y += gravity * Time.deltaTime;

            Vector3 motion = moveDir * speed + Vector3.up * _verticalVelocity.y;
            _controller.Move(motion * Time.deltaTime);
        }

        private void HandleVehicleEnterInput()
        {
            if (!Input.GetKeyDown(KeyCode.F)) return;

            var hits = Physics.OverlapSphere(transform.position, vehicleInteractRange);
            VehicleController nearest = null;
            float nearestDist = float.MaxValue;
            foreach (var hit in hits)
            {
                var vc = hit.GetComponentInParent<VehicleController>();
                if (vc == null || vc.IsOccupied) continue;
                float d = Vector3.Distance(transform.position, vc.transform.position);
                if (d < nearestDist) { nearestDist = d; nearest = vc; }
            }

            if (nearest != null) EnterVehicle(nearest);
        }

        private void HandleVehicleExitInput()
        {
            if (Input.GetKeyDown(KeyCode.F)) ExitVehicle();
        }

        public void EnterVehicle(VehicleController vehicle)
        {
            _currentVehicle = vehicle;
            _controller.enabled = false;
            vehicle.SetDriver(this);
        }

        public void ExitVehicle()
        {
            if (_currentVehicle == null) return;
            Vector3 exitPos = _currentVehicle.GetExitPoint();
            _currentVehicle.SetDriver(null);
            _currentVehicle = null;
            transform.position = exitPos;
            _controller.enabled = true;
        }
    }
}
