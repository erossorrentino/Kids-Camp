using UnityEngine;

namespace CrimeCity.World
{
    /// <summary>
    /// Procedurally lays out a grid city: roads, blocks, and buildings
    /// whose height/footprint/color vary by district (downtown = tall
    /// dense towers, suburbs = short wide houses, industrial = flat sheds,
    /// docks = warehouses next to open water for boats/submarines,
    /// airport = a flat strip with hangars for planes).
    ///
    /// This is deliberately built from Unity primitives (cubes) with
    /// per-district materials rather than hand-modeled/textured buildings
    /// -- there's no way to author 1000+ unique textured building meshes
    /// procedurally without real 3D art tooling. Swap BuildDistrict's
    /// prefab spawn calls for real modular building kit prefabs (e.g. a
    /// Synty/asset-store city pack) to get final art without touching the
    /// layout logic.
    /// </summary>
    public class CityGenerator : MonoBehaviour
    {
        public enum District { Downtown, Suburbs, Industrial, Docks, Airport, Military }

        [System.Serializable]
        public struct DistrictBlock
        {
            public District type;
            public Vector2Int gridOrigin; // in city blocks
            public Vector2Int gridSize;   // in city blocks
        }

        [SerializeField] private float blockSize = 40f;
        [SerializeField] private float roadWidth = 8f;
        [SerializeField] private DistrictBlock[] districts;
        [SerializeField] private Material downtownMat;
        [SerializeField] private Material suburbMat;
        [SerializeField] private Material industrialMat;
        [SerializeField] private Material dockMat;
        [SerializeField] private Material roadMat;

        [ContextMenu("Generate City")]
        public void Generate()
        {
            ClearExisting();
            var root = new GameObject("GeneratedCity").transform;
            root.SetParent(transform, false);

            foreach (var d in districts)
            {
                BuildDistrict(d, root);
            }
        }

        private void ClearExisting()
        {
            var existing = transform.Find("GeneratedCity");
            if (existing != null)
            {
                if (Application.isPlaying) Destroy(existing.gameObject);
                else DestroyImmediate(existing.gameObject);
            }
        }

        private void BuildDistrict(DistrictBlock d, Transform root)
        {
            var districtRoot = new GameObject($"District_{d.type}").transform;
            districtRoot.SetParent(root, false);

            for (int x = 0; x < d.gridSize.x; x++)
            {
                for (int z = 0; z < d.gridSize.y; z++)
                {
                    Vector3 blockCenter = new Vector3(
                        (d.gridOrigin.x + x) * (blockSize + roadWidth),
                        0f,
                        (d.gridOrigin.y + z) * (blockSize + roadWidth));

                    SpawnRoadTile(blockCenter, districtRoot);
                    SpawnBuilding(d.type, blockCenter, districtRoot);
                }
            }
        }

        private void SpawnRoadTile(Vector3 center, Transform parent)
        {
            var road = GameObject.CreatePrimitive(PrimitiveType.Cube);
            road.name = "RoadTile";
            road.transform.SetParent(parent, false);
            road.transform.position = new Vector3(center.x, -0.05f, center.z);
            road.transform.localScale = new Vector3(blockSize + roadWidth, 0.1f, blockSize + roadWidth);
            ApplyMaterial(road, roadMat);
        }

        private void SpawnBuilding(District district, Vector3 blockCenter, Transform parent)
        {
            if (district == District.Airport || district == District.Docks)
            {
                // open space districts get sparse low structures instead of dense towers
                if (Random.value > 0.35f) return;
            }

            var (minH, maxH, footprintScale, mat) = GetDistrictParams(district);
            float height = Random.Range(minH, maxH);
            float footprint = blockSize * footprintScale;

            var building = GameObject.CreatePrimitive(PrimitiveType.Cube);
            building.name = $"Building_{district}";
            building.transform.SetParent(parent, false);
            building.transform.position = blockCenter + Vector3.up * (height / 2f);
            building.transform.localScale = new Vector3(footprint, height, footprint);
            ApplyMaterial(building, mat);
        }

        private (float minH, float maxH, float footprintScale, Material mat) GetDistrictParams(District d)
        {
            switch (d)
            {
                case District.Downtown: return (30f, 220f, 0.75f, downtownMat);
                case District.Suburbs: return (4f, 9f, 0.55f, suburbMat);
                case District.Industrial: return (6f, 16f, 0.8f, industrialMat);
                case District.Docks: return (8f, 20f, 0.6f, dockMat);
                case District.Airport: return (5f, 12f, 0.5f, industrialMat);
                case District.Military: return (5f, 14f, 0.6f, industrialMat);
                default: return (10f, 20f, 0.6f, suburbMat);
            }
        }

        private void ApplyMaterial(GameObject go, Material mat)
        {
            if (mat == null) return;
            var renderer = go.GetComponent<Renderer>();
            if (renderer != null) renderer.sharedMaterial = mat;
        }
    }
}
